import { Octokit } from '@octokit/core';
import fs from 'fs';
import Mustache from 'mustache';

const mustacheTemplate = `./stats.mustache`;

const handler = async () => {
  try {
    const octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN
    })
  
    const packages = [];

    const folders = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}{?ref}', {
      owner: 'vercel',
      repo: 'next.js',
      path: 'packages/next/src/compiled'
    })

    fs.writeFile('next-compiled-folders.json', JSON.stringify(folders.data), 'utf8', () => console.log('Saved compiled folders'));

    if (folders?.data?.length) {
      await Promise.all(folders.data.map(async (folder) => {
        const folderContents = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}{?ref}', {
          owner: 'vercel',
          repo: 'next.js',
          path: folder.path
        });

        let subFolderContents = {};
        
        if (folderContents.data.length) {
          subFolderContents = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}{?ref}', {
            owner: 'vercel',
            repo: 'next.js',
            path: folderContents.data[0].path
          });
        }

        let license = folderContents.data.find((file) => file.name === 'LICENSE');

        if (!license && subFolderContents?.data?.length) {
          license = subFolderContents.data.find((file) => file.name === 'LICENSE');
        }

        let licenseContents = {};

        if (license) {
          const licenseContentsRequest = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}{?ref}', {
            owner: 'vercel',
            repo: 'next.js',
            path: license.path
          });

          licenseContents = licenseContentsRequest.data;
        }

        let packageJson = folderContents.data.find((file) => file.name === 'package.json');

        if (!packageJson && subFolderContents?.data?.length) {
          packageJson = subFolderContents.data.find((file) => file.name === 'package.json');
        }

        let packageJsonContents = {};

        if (packageJson) {
          const packageJsonContentsRequest = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}{?ref}', {
            owner: 'vercel',
            repo: 'next.js',
            path: packageJson.path
          });

          packageJsonContents = packageJsonContentsRequest.data;
        }
          
        packages.push({
          name: folder.name,
          path: folder.path,
          url: folder.url,
          license: `${licenseContents?.content ? atob(licenseContents.content) : ""}`,
          packageJson: `${packageJsonContents?.content ? atob(packageJsonContents.content) : "No package.json found"}`
        });
      }));
    }

    const output = JSON.stringify(packages);
    fs.writeFile('next-compiled-licenses.json', output, 'utf8', () => console.log('Saved compiled licenses'));

    await fs.readFile(mustacheTemplate, (err, data) => {
      if (err) throw err;

      const licenseTypes = new Set(packages.map((pkg) => {
        const packageJsonParsed = pkg.packageJson ? JSON.parse(pkg.packageJson) : {};

        return packageJsonParsed?.license || 'Unknown';
      }))
      
      const output = Mustache.render(data.toString(), {
        count: packages.length,
        licenseTypes: Array.from(licenseTypes).join(', ')
      });
      fs.writeFileSync('README.md', output);
    });
  } catch (error) {
    console.error(error);
  }
};

handler();