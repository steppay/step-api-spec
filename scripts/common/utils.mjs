import fs from 'fs/promises'
import path from 'path'
import _ from 'lodash'
import {DOWNLOADED_SPECS_DIR, SERVICES} from "./constants.mjs";
import console from "console";

export function getSpecPathByServiceName(serviceName, prefix = '') {
    return './' + path.join(prefix, serviceName) + '.json'
}

export async function pathExists(dirPath) {
    try {
        await fs.access(dirPath)
        return true
    } catch {
        return false
    }
}

export const fileExists = pathExists
export const directoryExists = pathExists

function omitRecursive(obj, omitKeys) {
    if (_.isObject(obj)) {
        let newObj = _.omit(obj, omitKeys)
        _.keys(newObj).forEach((key) => {
            if (_.isObject(newObj[key])) {
                newObj[key] = omitRecursive(newObj[key], omitKeys)
            }
        })
        return newObj
    } else {
        return obj
    }
}

export function areComponentsEqual(component1, component2) {
    const omitFields = ['description']
    return _.isEqual(omitRecursive(component1, omitFields), omitRecursive(component2, omitFields))
}

export function replaceValueRecursive(obj, originalValue, newValue) {
    if (Array.isArray(obj)) {
        return obj.map((item) => replaceValueRecursive(item, originalValue, newValue))
    } else if (typeof obj === 'object' && obj !== null) {
        return Object.keys(obj).reduce((newObj, key) => {
            const value = obj[key]
            newObj[key] = value === originalValue ? newValue : replaceValueRecursive(value, originalValue, newValue)
            return newObj
        }, {})
    } else {
        return obj === originalValue ? newValue : obj
    }
}

export function replaceEnumRecursive(obj, targetArray, newValue) {
    for (let key in obj) {
        if (key === 'enum' && _.isArray(obj[key]) && _.isEqual(obj[key], targetArray)) {
            obj[key] = newValue
        }
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            replaceEnumRecursive(obj[key], targetArray, newValue)
        }
    }
    return obj
}

export function capitalize(str) {
    return _.capitalize(str)
}

export function renameField(obj, originalFieldName, newFieldName) {
    if (obj[originalFieldName]) {
        obj[newFieldName] = obj[originalFieldName]
        delete obj[originalFieldName]
    }
    return obj
}

export async function loadSpecs() {
    return await SERVICES.reduce(async (accPromise, service) => {
        const acc = await accPromise;
        const downloadedSpecPath = getSpecPathByServiceName(service, DOWNLOADED_SPECS_DIR);

        if (!(await fileExists(downloadedSpecPath))) {
            console.error(`문제가 발생한 서비스: ${service}`);
            console.error(`문제가 발생한 경로: ${downloadedSpecPath}`);
            throw new Error('다운받은 Open API 스펙 파일이 모두 있어야 합니다.');
        }

        const spec = await fs.readFile(downloadedSpecPath);
        return {...acc, [service]: JSON.parse(spec.toString())};
    }, Promise.resolve({}));
}

export async function loadSpecFrom(directory, fileName) {
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