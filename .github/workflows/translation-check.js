const fs = require('fs');
const { execSync } = require('child_process');
const axios = require('axios');

async function getTranslations(bearerToken) {
  if (!bearerToken) {
    throw new Error('Bearer token is not provided');
  }
  try {
    const response = await axios.get('https://hq.hatcher.com/api/languages/en', {
      headers: { 'Authorization': `Bearer ${bearerToken}` }
    });
    return new Set(Object.keys(response.data));
  } catch (error) {
    console.error('Error fetching translations:', error.message);
    return new Set();
  }
}

function findTranslationLocation(key) {
  const command = `git diff HEAD^ HEAD -U0 | grep -n "+.*['\\"]${key}['\\"]"`;
  try {
    const result = execSync(command, { encoding: 'utf-8' });
    const match = result.match(/\+\+\+ b\/(.+)\n@@ .+ @@\n(\d+):/);
    if (match) {
      return { file: match[1], line: match[2] };
    }
  } catch (error) {
    // grep returns non-zero exit code if no match found
  }
  return null;
}

function parseMdTable(content) {
  const lines = content.split('\n').slice(2); // Skip header
  return lines.map(line => {
    const [key, status, location] = line.split('|').map(cell => cell.trim());
    return { key: key.replace(/[\[\]\`]/g, ''), status, location };
  });
}

async function main(bearerToken) {
  try {
    const existingTranslations = await getTranslations(bearerToken);

    let mdContent = '';
    try {
      mdContent = fs.readFileSync('translations.md', 'utf-8');
    } catch (error) {
      // File doesn't exist yet
    }

    const previousTranslations = mdContent ? parseMdTable(mdContent) : [];
    const missingTranslations = previousTranslations.filter(t => t.status === 'Missing');

    const diff = execSync('git diff HEAD^ HEAD').toString();
    const newTranslations = [];
    const pattern = /['\"]([\w_]+)['\"]:\s*['\"](.+?)['\"]|['\"]([\w_]+)['\"]:\s*$/g;
    let match;

    while ((match = pattern.exec(diff)) !== null) {
      const key = match[1] || match[3];
      if (key) {
        const location = findTranslationLocation(key);
        if (location) {
          if (!existingTranslations.has(key)) {
            newTranslations.push({ key, ...location, status: 'Added' });
          } else {
            const missingIndex = missingTranslations.findIndex(t => t.key === key);
            if (missingIndex !== -1) {
              missingTranslations[missingIndex] = { key, ...location, status: 'Added' };
            }
          }
        }
      }
    }

    const updatedTranslations = [
      ...previousTranslations.filter(t => t.status !== 'Missing'),
      ...missingTranslations,
      ...newTranslations
    ];

    console.log(JSON.stringify(updatedTranslations));
  } catch (error) {
    console.error('Error in main function:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main(process.argv[2]);
}

module.exports = { main };
