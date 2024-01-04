#!/usr/bin/env node
import console from 'console'
import fs from 'fs/promises'
import {
    COMBINE_SPECS_DIR,
    EXAMPLE_SPECS,
    INCLUDE_TAG,
    MERGED_SPECS_DIR, PUBLISH_SPECS_DIR, REQUIRED_SPECS, STOPLIGHT_PATH_MAP,
    TAG_SPECS
} from './common/constants.mjs'
import {directoryExists, loadSpecFrom} from './common/utils.mjs'
import {extractSchemas} from './combineSpecs.mjs'

async function addTag(inPath, inFileName, outPath) {
    try {
        const spec = await loadSpecFrom(inPath, `${inFileName}.json`);
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

        const savePath = `${outPath}/${inFileName}_tag.json`
        if (!(await directoryExists(outPath))) {
            await fs.mkdir(outPath);
        }

        await fs.writeFile(savePath, JSON.stringify(spec, null, 2));

    } catch (e) {
        console.log(e);
    }
}

function extractReferencedSchemasByTags(spec, pathSegments) {
    const filterFn = operation => pathSegments.some(segment => operation.operationId.includes(segment)) && operation.tags && operation.tags.some(tag => INCLUDE_TAG.includes(tag));
    const schemasToKeep = extractSchemas(spec, filterFn);

    const schemasToDelete = Object.keys(spec.components.schemas).filter(schemaName => !schemasToKeep.has(schemaName));
    schemasToDelete.forEach(schemaName => {
        delete spec.components.schemas[schemaName];
    });
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

        await fs.writeFile(`${COMBINE_SPECS_DIR}/${outFileName}`, JSON.stringify(spec, null, 2));

    } catch (e) {
        console.log(e);
    }
}

async function setStoplightId(inPath, inFileName, outPath, outFileName) {
    const spec = await loadSpecFrom(inPath, inFileName);
    const stoplightContents = await fs.readFile(STOPLIGHT_PATH_MAP, 'utf-8');
    const stoplightMap = JSON.parse(stoplightContents);

    for (const [path, methods] of Object.entries(spec.paths)) {
        const stoplightData = stoplightMap[path];
        if (stoplightData) {
            for (const [method, methodDetails] of Object.entries(methods)) {
                if (stoplightData[method]) {
                    spec.paths[path][method]['x-stoplight'] = stoplightData[method]['x-stoplight'];
                    if (stoplightData[method]['x-internal']) {
                        spec.paths[path][method]['x-internal'] = stoplightData[method]['x-internal'];
                    }
                }
            }
        }
    }

    await fs.writeFile(`${outPath}/${outFileName}`, JSON.stringify(spec, null, 2));
}

async function reviceRequied(inPath, inFileName, outFileName) {
    const spec = await loadSpecFrom(inPath, inFileName);
    const schemas = spec.components.schemas; // DTO Schema

    const requiredMappingContent = await fs.readFile(REQUIRED_SPECS, 'utf-8');
    const requiredMap = JSON.parse(requiredMappingContent); // required spec

    for (const [DTOName, required] of Object.entries(requiredMap)) {
        schemas[DTOName].required = required
    }

    await fs.writeFile(`${COMBINE_SPECS_DIR}/${outFileName}`, JSON.stringify(spec, null, 2));
}


async function v1Spec() {
    // 공개된 V1 API에 맞게 정렬
    await addTag(MERGED_SPECS_DIR, 'v1', COMBINE_SPECS_DIR);

    // required 수정
    await reviceRequied(COMBINE_SPECS_DIR, 'v1_tag.json', 'v1_required.json')

    // V1 요청, 응답 예시 넣어주기
    await addExamples(COMBINE_SPECS_DIR, 'v1_required.json', 'v1_example.json')

    // stoplight id 추가
    await setStoplightId(COMBINE_SPECS_DIR, 'v1_example.json', PUBLISH_SPECS_DIR, 'steppay_v1.json');
}

v1Spec()