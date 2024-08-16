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
  const translations = new Set();
  let match;
  while ((match = pattern.exec(content)) !== null) {
    translations.add(match[1] || match[2]);
  }
  return translations;
}

function scanForTranslations() {
  const translations = new Set();
  const files = glob.sync('**/*.{js,vue,ts}', { ignore: ['node_modules/**', 'dist/**'] });
  files.forEach(file => {
    const fileTranslations = findTranslationsInFile(file);
    fileTranslations.forEach(translation => translations.add(translation));
  });
  return translations;
}

function getNewTranslationsFromLatestCommit() {
  const diff = execSync('git diff HEAD^ HEAD').toString();
  const pattern = /\+.*\$t\(['"](.+?)['"]\)|\+.*\$__\(['"](.+?)['"]\)/g;
  const newTranslations = new Set();
  let match;
  while ((match = pattern.exec(diff)) !== null) {
    newTranslations.add(match[1] || match[2]);
  }
  return newTranslations;
}

function getFileAndLineForTranslation(key) {
  try {
    const result = execSync(`git grep -n "$t('${key}')" "$__('${key}')"`, { encoding: 'utf-8' });
    const [file, line] = result.split(':');
    return { file, line: line.trim() };
  } catch (error) {
    return { file: 'Unknown', line: 'Unknown' };
  }
}

async function main(bearerToken) {
  try {
    const existingTranslations = await getTranslations(bearerToken);
    const scannedTranslations = scanForTranslations();
    const newTranslationsFromLatestCommit = getNewTranslationsFromLatestCommit();

    const allTranslations = new Map();

    for (const translation of scannedTranslations) {
      const status = existingTranslations.has(translation) ? 'Existing' : 'Missing';
      const { file, line } = getFileAndLineForTranslation(translation);
      allTranslations.set(translation, { status, file, line, isNew: newTranslationsFromLatestCommit.has(translation) });
    }

    const result = {
      allTranslations: Array.from(allTranslations, ([key, value]) => ({ key, ...value })),
      newTranslations: Array.from(newTranslationsFromLatestCommit)
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
