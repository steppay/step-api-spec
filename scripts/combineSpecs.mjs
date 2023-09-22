#!/usr/bin/env node
import console from 'console'
import fs from 'fs/promises'
import { 
    DOWNLOADED_SPECS_DIR, 
    GATEWAY_SPECS_DIR, 
    MERGED_SPECS_DIR, 
    COMPLETE_SPECS_DIR,
    SERVICES, 
    INCLUDE_TAG,
    TAG_SPECS,
    EXAMPLE_SPECS
} from './common/constants.mjs'
import {
    areComponentsEqual,
    pathExists,
    fileExists,
    directoryExists,
    getSpecPathByServiceName,
    renameField,
    replaceValueRecursive,
    capitalize,
    replaceEnumRecursive
} from './common/utils.mjs'
import _ from 'lodash'

const API_SEGMENT = process.env.API_SEGMENT ?? 'all'

async function loadSpecs() {
    return await SERVICES.reduce(async (accPromise, service) => {
        const acc = await accPromise;
        const downloadedSpecPath = getSpecPathByServiceName(service, DOWNLOADED_SPECS_DIR);

        if (!(await fileExists(downloadedSpecPath))) {
            console.error(`문제가 발생한 서비스: ${service}`);
            console.error(`문제가 발생한 경로: ${downloadedSpecPath}`);
            throw new Error('다운받은 Open API 스펙 파일이 모두 있어야 합니다.');
        }

        const spec = await fs.readFile(downloadedSpecPath);
        return { ...acc, [service]: JSON.parse(spec.toString()) };
    }, Promise.resolve({}));
}

async function loadSpecFrom(directory, fileName) {
    try {
        const specPath = `${directory}/${fileName}`;

        if (!(fs.access(specPath))) {
            console.error(`문제가 발생한 경로: ${specPath}`);
            throw new Error(`해당 경로에 스펙 파일이 없습니다: ${specPath}`);
        }

        const specContent = await fs.readFile(specPath);
        return JSON.parse(specContent.toString());
    } catch (e) {
        console.error(e);
        throw e;
    }
}

function combineSpec(specs) {
    // 이름이 겹치는 컴포넌트 찾기
    const duplicatedComponentNames = new Set()
    const schemas = {}
    Object.entries(specs).forEach(([_, spec]) => {
        Object.entries(spec.components.schemas).forEach(([componentName, componentItemObj]) => {
            if (schemas[componentName] && !areComponentsEqual(schemas[componentName], componentItemObj)) {
                duplicatedComponentNames.add(componentName)
            }
            schemas[componentName] = componentItemObj
        })
    })

    // 이름이 겹치면 서비스명 prefix 로 붙이기
    Object.entries(specs).forEach(([service, spec]) => {
        Object.entries(specs[service].components.schemas).forEach(([oldComponentName]) => {
            if (duplicatedComponentNames.has(oldComponentName)) {
                const newComponentName = `${capitalize(service)}${capitalize(oldComponentName)}`
                const oldRef = `#/components/schemas/${oldComponentName}`
                const newRef = `#/components/schemas/${newComponentName}`
                specs[service] = replaceValueRecursive(specs[service], oldRef, newRef)
                specs[service].components.schemas = renameField(
                    specs[service].components.schemas,
                    oldComponentName,
                    newComponentName,
                )
            }
        })
    })

    // 스펙 합치기
    const combinedSpec = {
        openapi: '3.0.1',
        info: {
            title: 'Steppay API',
            version: '1.0',
        },
        servers: [
            {
                url: 'https://api.steppay.kr',
                description: 'Generated server url',
            },
        ],
        paths: {},
        components: {
            schemas: {},
        },
    }
    Object.entries(specs).forEach(([_, spec]) => {
        Object.entries(spec.paths).forEach(([path, pathItemObj]) => {
            combinedSpec.paths[path] = Object.assign({}, combinedSpec.paths[path], pathItemObj)
        })
        Object.entries(spec.components.schemas).forEach(([componentName, componentItemObj]) => {
            combinedSpec.components.schemas[componentName] = componentItemObj
        })
    })

    return combinedSpec
}

// 임시 교정
function fixEnum(spec) {
    spec.components.schemas = replaceEnumRecursive(
        spec.components.schemas,
        ['갱신 결제', '단건 주문', '결제수단 변경', '갱신 결제(최초 주문)', '사용량 추가'],
        ['RECURRING', 'ONE_TIME', 'PAYMENT_METHOD', 'RECURRING_INITIAL', 'ADD_USAGE'],
    )

    spec.components.schemas = replaceEnumRecursive(
        spec.components.schemas,
        ['임시저장', '발송 예약', '발송', '결제 완료', '미납입', '발송 실패'],
        ['TEMPORARY', 'RESERVATION', 'SENT', 'PAID', 'OVER_DUE', 'SEND_FAIL'],
    )
    return spec
}

function clearTags(spec) {
    return spec
}

function extractSchemasFromRef(schemaRef, spec, collectedSchemas) {
    if (typeof schemaRef !== "string") {
        console.error("Invalid schemaRef:", schemaRef);
        return;
    }

    const schemaName = schemaRef.split('/').pop();
    if (collectedSchemas.has(schemaName)) {
        return;
    }

    collectedSchemas.add(schemaName);

    const schema = spec.components.schemas[schemaName];
    if (schema) {
        if (schema.properties) {
            for (let propName in schema.properties) {
                if (schema.properties[propName]["$ref"]) {
                    extractSchemasFromRef(schema.properties[propName]["$ref"], spec, collectedSchemas);
                } else if (schema.properties[propName].type === "array" && schema.properties[propName].items && schema.properties[propName].items["$ref"]) {
                    extractSchemasFromRef(schema.properties[propName].items["$ref"], spec, collectedSchemas);
                } else if (schema.properties[propName].additionalProperties && schema.properties[propName].additionalProperties.items && schema.properties[propName].additionalProperties.items["$ref"]) {
                    extractSchemasFromRef(schema.properties[propName].additionalProperties.items["$ref"], spec, collectedSchemas);
                }
            }
        }
        if (schema.items && schema.items["$ref"]) {
            extractSchemasFromRef(schema.items["$ref"], spec, collectedSchemas);
        }
    }
}

// /api/v1/product/... 에서 product를 가져와서 태그로 사용
function getTagFromPath(path) {
    const tag = path.split("/");
    return tag[3] || '';
}

function processOperation(operation, spec, schemasToKeep, filterFn) {
    if (typeof operation === 'object' && filterFn(operation)) {
        // request 스키마 추출
        if (operation.requestBody &&
            operation.requestBody.content["application/json"]) {
            if (operation.requestBody.content["application/json"].schema["$ref"]) {
                extractSchemasFromRef(operation.requestBody.content["application/json"].schema["$ref"], spec, schemasToKeep);
            }
            if (operation.requestBody.content["application/json"].schema.items && operation.requestBody.content["application/json"].schema.items["$ref"]) {
                extractSchemasFromRef(operation.requestBody.content["application/json"].schema.items["$ref"], spec, schemasToKeep);
            }
            if (operation.requestBody.content["application/json"].schema.properties && operation.requestBody.content["application/json"].schema.properties.data
                && operation.requestBody.content["application/json"].schema.properties.data["$ref"]) {
                extractSchemasFromRef(operation.requestBody.content["application/json"].schema.properties.data["$ref"], spec, schemasToKeep);
            }
            if (operation.requestBody.content["application/json"].schema.properties && operation.requestBody.content["application/json"].schema.properties.subscriptionChangePriceAdminDTO
                && operation.requestBody.content["application/json"].schema.properties.subscriptionChangePriceAdminDTO["$ref"]) {
                extractSchemasFromRef(operation.requestBody.content["application/json"].schema.properties.subscriptionChangePriceAdminDTO["$ref"], spec, schemasToKeep);
            }
        }

        // parameters 스키마 추출
        if (operation.parameters) {
            operation.parameters.forEach(parameter => {
                if (parameter.schema && parameter.schema["$ref"]) {
                    extractSchemasFromRef(parameter.schema["$ref"], spec, schemasToKeep);
                }
            });
        }

        // response 스키마 추출
        Object.values(operation.responses).forEach(response => {
            if (response.content && response.content["*/*"]) {
                if (response.content["*/*"].schema && response.content["*/*"].schema["$ref"]) {
                    extractSchemasFromRef(response.content["*/*"].schema["$ref"], spec, schemasToKeep);
                }
                if (response.content["*/*"].schema && response.content["*/*"].schema.items && response.content["*/*"].schema.items["$ref"]) {
                    extractSchemasFromRef(response.content["*/*"].schema.items["$ref"], spec, schemasToKeep);
                }
                if (response.content["*/*"].schema && response.content["*/*"].schema.additionalProperties && response.content["*/*"].schema.additionalProperties["$ref"]) {
                    extractSchemasFromRef(response.content["*/*"].schema.additionalProperties["$ref"], spec, schemasToKeep);
                }
            }
        });
    }
}

function extractReferencedSchemas(spec, pathSegments) {
    const filterFn = operation => pathSegments.some(segment => operation.operationId.includes(segment));
    const schemasToKeep = extractSchemas(spec, filterFn);

    const schemasToDelete = Object.keys(spec.components.schemas).filter(schemaName => !schemasToKeep.has(schemaName));
    schemasToDelete.forEach(schemaName => {
        delete spec.components.schemas[schemaName];
    });
}

function extractReferencedSchemasByTags(spec, pathSegments) {
    const filterFn = operation => pathSegments.some(segment => operation.operationId.includes(segment)) && operation.tags && operation.tags.some(tag => INCLUDE_TAG.includes(tag));
    const schemasToKeep = extractSchemas(spec, filterFn);

    const schemasToDelete = Object.keys(spec.components.schemas).filter(schemaName => !schemasToKeep.has(schemaName));
    schemasToDelete.forEach(schemaName => {
        delete spec.components.schemas[schemaName];
    });
}

function extractSchemas(spec, filterFn) {
    const schemasToKeep = new Set();

    Object.keys(spec.paths).forEach(path => {
        Object.values(spec.paths[path]).forEach(operation => {
            processOperation(operation, spec, schemasToKeep, filterFn);
        });
    });

    return schemasToKeep;
}

function updateOperationIdAndTagsByPathPrefix(spec, pathSegments = []) {
    const uniqueOperationIds = new Set();

    Object.entries(spec.paths).forEach(([path, methods]) => {
        pathSegments.forEach((segment) => {
            const pathPrefix = segment === "all" ? '/api' : `/api/${segment}`;
            if (path.toLowerCase().startsWith(pathPrefix.toLowerCase())) {
                Object.entries(methods).forEach(([method, operation]) => {
                    if (typeof operation === 'object') {
                        let newOperationId = segment + '_' + operation['operationId'];
                        let counter = 2;
                        while (uniqueOperationIds.has(newOperationId)) {
                            newOperationId = segment + '_' + operation['operationId'] + '_' + counter;
                            counter++;
                        }
                        uniqueOperationIds.add(newOperationId);
                        // operation['tags'] = [segment];
                        operation['tags'] = [getTagFromPath(path)];
                        operation['operationId'] = newOperationId;
                    }
                });
                // console.log("path: ", path)
            } else {
                delete spec.paths[path];
            }
        });
    });

    extractReferencedSchemas(spec, pathSegments)

    return spec;
}

async function writeSpec(spec, apiName, isMerged) {
    let writePath = isMerged ? MERGED_SPECS_DIR : GATEWAY_SPECS_DIR;

    if (!(await pathExists(writePath))) {
        await fs.mkdir(writePath)
    }
    spec.info.title = apiName

    const path = getSpecPathByServiceName(apiName, writePath)
    await fs.writeFile(path, JSON.stringify(spec, null, 4), {})
}

async function mergeSpecBySegment() {
    try {
        const loadedSpecs = await loadSpecs()
        const specs = loadedSpecs
        let spec = combineSpec(specs)
        spec = fixEnum(spec)
        spec = clearTags(spec)
        spec = updateOperationIdAndTagsByPathPrefix(spec, [API_SEGMENT])

        await writeSpec(spec, `${API_SEGMENT}`.toLocaleLowerCase(), true)
    } catch (e) {
        console.log(e)
    }
}

async function filterSpecBySegment() {
    try {
        const loadedSpecs = await loadSpecs();
        const targetSegment = ['v1'];

        for (const [service, specData] of Object.entries(loadedSpecs)) {
            if (targetSegment.includes(API_SEGMENT)) {
                let spec = specData;
                spec = fixEnum(spec);
                spec = clearTags(spec);
                spec = updateOperationIdAndTagsByPathPrefix(spec, [API_SEGMENT]);
                await writeSpec(spec, `${API_SEGMENT}_${service}`.toLowerCase(), false);
            }
        }
    } catch (e) {
        console.log(e)
    }
}

async function addTag(inPath, outPath, fileName) {
    try {
        const spec = await loadSpecFrom(inPath, `${fileName}.json`);
        spec.info.title = 'STEPPAY'

        const tagsMappingContent = await fs.readFile(TAG_SPECS, 'utf-8');
        const tagsMapping = JSON.parse(tagsMappingContent);

        let sortedPaths = {};
        for (const [tag, paths] of Object.entries(tagsMapping)) {
            for (const path of paths) {
                if (spec.paths[path]) {
                    sortedPaths[path] = spec.paths[path];
                }
            }
        }

        for (const [pathKey, pathValue] of Object.entries(spec.paths)) {
            if (!sortedPaths[pathKey]) {
                sortedPaths[pathKey] = pathValue;
            }
        }

        let pathsToRemove = [];
        spec.paths = sortedPaths;
        for (const [pathKey, pathValue] of Object.entries(spec.paths)) {
            let matchedTag = "포함되지 않은 API";
            for (const [tag, paths] of Object.entries(tagsMapping)) {
                if (paths.includes(pathKey)) {
                    matchedTag = tag;
                    break;
                }
            }

            for (const method of Object.values(pathValue)) {
                method.tags = [];

                if (!method.tags.includes(matchedTag)) {
                    method.tags.push(matchedTag);
                }
            }

            if (matchedTag === "포함되지 않은 API") {
                pathsToRemove.push(pathKey);
            }
        }

        // "포함되지 않은 API" 태그가 있는 path 삭제
        for (const pathToRemove of pathsToRemove) {
            delete spec.paths[pathToRemove];
        }
        const targetSegment = ['v1'];
        extractReferencedSchemasByTags(spec, targetSegment);

        const savePath = `${outPath}/${fileName}_tag.json`
        if (!(await directoryExists(outPath))) {
            await fs.mkdir(outPath);
        }

        await fs.writeFile(savePath, JSON.stringify(spec, null, 2));

    } catch (e) {
        console.log(e);
    }
}

async function addExamples(inPath, inFileName, outFileName) {
    try {
        const spec = await loadSpecFrom(inPath, inFileName);
        const exampleContents = await fs.readFile(EXAMPLE_SPECS, 'utf-8');
        const examples = JSON.parse(exampleContents);

        Object.entries(examples).forEach(([examplePath, exampleMethods]) => {
            if (spec.paths[examplePath]) {
                Object.entries(exampleMethods).forEach(([exampleMethod, exampleData]) => {
                    const operation = spec.paths[examplePath][exampleMethod];
        
                    if (operation !== null && operation !== undefined && typeof operation === 'object') {
        
                        // requestBody의 application/json에 examples 추가
                        if (exampleData.requestBody && operation.requestBody && operation.requestBody.content && operation.requestBody.content['application/json']) {
                            if (!operation.requestBody.content['application/json'].examples) {
                                operation.requestBody.content['application/json'].examples = {};
                            }
                            operation.requestBody.content['application/json'].examples = exampleData.requestBody;
                        }
        
                        // responses의 첫 번째 항목의 */*에 examples 추가
                        if (exampleData.responses && operation.responses) {
                            const firstResponseKey = Object.keys(operation.responses)[0];
                            if (firstResponseKey && operation.responses[firstResponseKey].content && operation.responses[firstResponseKey].content['*/*']) {
                                if (!operation.responses[firstResponseKey].content['*/*'].examples) {
                                    operation.responses[firstResponseKey].content['*/*'].examples = {};
                                }
                                operation.responses[firstResponseKey].content['*/*'].examples = exampleData.responses;
                            }
                        }
                    }
                });
            }
        });              
        
        await fs.writeFile(`${COMPLETE_SPECS_DIR}/${outFileName}`, JSON.stringify(spec, null, 2));

    } catch (e) {
        console.log(e);
    }
}

async function publish(filePaths) {
    try {
        for (const filePath of filePaths) {
            const fileName = path.basename(filePath);
            const destPath = path.join('./publish', fileName);
    
            await fs.copyFile(filePath, destPath);
            console.log(`Copied ${filePath} to ${destPath}`);
        }
    } catch (error) {
      console.error('An error occurred:', error);
    }
}

async function main() {
    // segment 별로 merge
    await mergeSpecBySegment();

    // service 별로 segment filtering
    await filterSpecBySegment();

    // 공개된 V1 API에 맞게 정렬
    await addTag(MERGED_SPECS_DIR, COMPLETE_SPECS_DIR, 'v1');

    // V1 요청, 응답 예시 넣어주기
    await addExamples(COMPLETE_SPECS_DIR, 'v1_tag.json', 'steppay_v1.json')

    // publish 폴더로 복사
    // await publish(['./complete/steppay_v1.json'])
}

main()