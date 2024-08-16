import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import axios from 'axios';
import { glob } from 'glob';

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

function findTranslationsInFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const pattern = /\$t\(['"](.+?)['"]\)|\$__\(['"](.+?)['"]\)/g;
  const translations = new Map();
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const key = match[1] || match[2];
    const line = content.substring(0, match.index).split('\n').length;
    translations.set(key, { file: filePath, line });
  }
  return translations;
}

function scanForTranslations() {
  const translations = new Map();
  const files = glob.sync('**/*.{js,vue,blade.php}', { ignore: ['node_modules/**', 'dist/**'] });
  files.forEach(file => {
    const fileTranslations = findTranslationsInFile(file);
    fileTranslations.forEach((value, key) => {
      if (!translations.has(key) || translations.get(key).file === 'Unknown') {
        translations.set(key, value);
      }
    });
  });
  return translations;
}

function getNewTranslationsFromLatestCommit() {
  const diff = execSync('git diff HEAD^ HEAD').toString();
  const pattern = /\+.*\$t\(['"](.+?)['"]\)|\+.*\$__\(['"](.+?)['"]\)/g;
  const newTranslations = new Map();
  let match;
  while ((match = pattern.exec(diff)) !== null) {
    const key = match[1] || match[2];
    const committer = execSync(`git log -1 --format="%an" -- $(git diff-tree --no-commit-id --name-only -r HEAD)`).toString().trim();
    newTranslations.set(key, committer);
  }
  return newTranslations;
}

function getPreviousTranslations() {
  try {
    const content = fs.readFileSync('translations.md', 'utf-8');
    const lines = content.split('\n').slice(2); // Skip header
    const translations = new Map();
    lines.forEach(line => {
      const [key, status, location, committer] = line.split('|').map(cell => cell.trim());
      translations.set(key.replace(/[`]/g, ''), { status, location, committer });
    });
    return translations;
  } catch (error) {
    return new Map();
  }
}

async function main(bearerToken) {
  try {
    const existingTranslations = await getTranslations(bearerToken);
    const scannedTranslations = scanForTranslations();
    const newTranslationsFromLatestCommit = getNewTranslationsFromLatestCommit();
    const previousTranslations = getPreviousTranslations();

    const allTranslations = [];
    let hasChanges = false;

    for (const [key, location] of scannedTranslations.entries()) {
      const status = existingTranslations.has(key) ? 'Existing' : 'Missing';
      const isNew = newTranslationsFromLatestCommit.has(key);
      const committer = isNew ? newTranslationsFromLatestCommit.get(key) : '';
      const previous = previousTranslations.get(key);

      if (isNew || !previous || status !== previous.status || `${location.file}:${location.line}` !== previous.location || committer !== previous.committer) {
        hasChanges = true;
      }

      allTranslations.push({
        key,
        status,
        file: location.file,
        line: location.line,
        isNew,
        committer
      });
    }

    // Check for removed translations
    for (const [key] of previousTranslations) {
      if (!scannedTranslations.has(key)) {
        hasChanges = true;
        break;
      }
    }

    const result = {
      allTranslations,
      newTranslations: Array.from(newTranslationsFromLatestCommit.keys()),
      hasChanges
    };

    console.log(JSON.stringify(result));
  } catch (error) {
    console.error('Error in main function:', error.message);
    process.exit(1);
  }
}

// Check if this module is being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv[2]);
}

export { main };
