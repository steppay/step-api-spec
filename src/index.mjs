import SwaggerUI from 'swagger-ui'
import 'swagger-ui/dist/swagger-ui.css'

import spec from '../gateway/merged_all.json'

SwaggerUI({
    spec: spec,
    dom_id: '#main',
})
