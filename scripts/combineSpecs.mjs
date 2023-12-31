#!/usr/bin/env node
import console from 'console'
import fs from 'fs/promises'
import {GATEWAY_SPECS_DIR, MERGED_SPECS_DIR, STOPLIGHT_ID} from './common/constants.mjs'
import {
    areComponentsEqual,
    capitalize,
    getSpecPathByServiceName,
    loadSpecs,
    pathExists,
    renameField,
    replaceEnumRecursive,
    replaceValueRecursive
} from './common/utils.mjs'

const API_SEGMENT = process.env.API_SEGMENT ?? 'all'

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
        openapi: "3.0.1",
        "x-stoplight": {
            "id": STOPLIGHT_ID
        },
        info: {
            "title": "STEPPAY",
            "version": "1.0",
            "contact": {
                "name": "Steppay",
                "url": "https://www.steppay.kr",
                "email": "contact@steppay.kr"
            }
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

    const secretToken = {
        "securitySchemes": {
            "Secret-Token": {
                "type": "apiKey",
                "in": "header",
                "name": "Secret-Token"
            }
        },
        "security": [
            {
                "Secret-Token": []
            }
        ]
    };

    if (!combinedSpec.components.securitySchemes) {
        combinedSpec.components.securitySchemes = {};
    }

    Object.assign(combinedSpec.components.securitySchemes, secretToken.securitySchemes);
    combinedSpec.security = secretToken.security;

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

// /api/v1/product/... 에서 product를 가져와서 태그로 사용
function getTagFromPath(path) {
    const tag = path.split("/");
    return tag[3] || '';
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

function extractReferencedSchemas(spec, pathSegments) {
    const filterFn = operation => pathSegments.some(segment => operation.operationId.includes(segment));
    const schemasToKeep = extractSchemas(spec, filterFn);

    const schemasToDelete = Object.keys(spec.components.schemas).filter(schemaName => !schemasToKeep.has(schemaName));
    schemasToDelete.forEach(schemaName => {
        delete spec.components.schemas[schemaName];
    });
}

export function extractSchemas(spec, filterFn) {
    const schemasToKeep = new Set();

    Object.keys(spec.paths).forEach(path => {
        Object.values(spec.paths[path]).forEach(operation => {
            processOperation(operation, spec, schemasToKeep, filterFn);
        });
    });

    return schemasToKeep;
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
        const specs = await loadSpecs()
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

async function combine() {
    // segment 별로 merge
    await mergeSpecBySegment();

    // service 별로 segment filtering
    await filterSpecBySegment();
}

combine()