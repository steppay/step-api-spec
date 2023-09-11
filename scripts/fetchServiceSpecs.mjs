#!/usr/bin/env node
import console from 'console'
import axios from 'axios'
import fs from 'fs/promises'
import process from 'process'
import { SERVICES, DOWNLOADED_SPECS_DIR } from './common/constants.mjs'
import { directoryExists, getSpecPathByServiceName } from './common/utils.mjs'

const APP_ENV = process.env.APP_ENV ?? 'develop'

async function fetchServiceOpenApiSpec(env, services) {
    const baseUrl = `https://api.${env === 'production' ? '' : env + '.'}steppay.kr/docs/manager`
    for (const service of services) {
        const response = await axios.get(`${baseUrl}/${service}/api-docs`)
        const data = response.data

        if (!(await directoryExists(DOWNLOADED_SPECS_DIR))) {
            await fs.mkdir(DOWNLOADED_SPECS_DIR)
        }

        const path = getSpecPathByServiceName(service, DOWNLOADED_SPECS_DIR)
        await fs.writeFile(path, JSON.stringify(data, null, 4), {})
    }
}

fetchServiceOpenApiSpec(APP_ENV, SERVICES).catch(console.error)
