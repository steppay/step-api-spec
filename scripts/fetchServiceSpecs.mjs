#!/usr/bin/env node
import console from 'console'
import axios from 'axios'
import fs from 'fs/promises'
import process from 'process'
import { SERVICES, DOWNLOADED_SPECS_DIR } from './common/constants.mjs'
import { directoryExists, getSpecPathByServiceName } from './common/utils.mjs'

const APP_ENV = process.env.APP_ENV ?? 'develop'

async function fetchServiceOpenApiSpec(env, services) {
    let baseUrl = `https://api.${env === 'production' ? '' : env + '.'}steppay.kr/docs/v1`
    if (env === 'local') {
        baseUrl = `http://localhost:9091/docs`
    }
    for (const service of services) {
        let response = ""
        if (env === 'local') {
            console.log("====> response ", `${baseUrl}/api-docs`)
            response = await axios.get(`${baseUrl}/api-docs`)
        } else {
            response = await axios.get(`${baseUrl}/${service}/api-docs`)
        }
        const data = response.data

        if (!(await directoryExists(DOWNLOADED_SPECS_DIR))) {
            await fs.mkdir(DOWNLOADED_SPECS_DIR)
        }

        const path = getSpecPathByServiceName(service, DOWNLOADED_SPECS_DIR)
        await fs.writeFile(path, JSON.stringify(data, null, 4), {})
    }
}

fetchServiceOpenApiSpec(APP_ENV, SERVICES).catch(console.error)
