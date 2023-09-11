import express from 'express';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import { fileURLToPath } from 'url';

const app = express();
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const specsDir = path.join(currentDir, '..', 'gateway');
const fetchSpecsDir = path.join(currentDir, '..', 'service');

const specRoutes = [];

// Helper function
const addSpecRoutesFromDir = (directory, prefix) => {
    fs.readdirSync(directory)
      .filter(file => file.endsWith('.json'))
      .sort()
      .forEach(file => {
        const specName = path.basename(file, '.json');
        const specData = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf-8'));

        app.use(`/swagger/${prefix}/${specName}`, swaggerUi.serve, (req, res) => {
          res.send(swaggerUi.generateHTML(specData));
        });

        specRoutes.push(`/swagger/${prefix}/${specName}`);
      });
};

// Add routes for both directories
addSpecRoutesFromDir(specsDir, 'gateway');
addSpecRoutesFromDir(fetchSpecsDir, 'service');

app.get('/swagger', (req, res) => {
  const generateLinksForPrefix = (prefix) => {
    return specRoutes
      .filter(route => route.includes(`/${prefix}/`))
      .map(route => `<li><a href="${route}">${route}</a></li>`)
      .join('');
  };

  const responseHtml = `
    <h3>Gateway</h3>
    <ul>
      ${generateLinksForPrefix('gateway')}
    </ul>
    <br><br><br>
    <h3>Service</h3>
    <ul>
      ${generateLinksForPrefix('service')}
    </ul>
  `;

  res.send(responseHtml);
});

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});
