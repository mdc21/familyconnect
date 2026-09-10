const fs = require('fs');
const path = require('path');

const FRONTEND_DIR = path.join(__dirname, '..');
const HEADER_FILE = path.join(FRONTEND_DIR, 'header.partial.html');

function injectHeaders() {
    console.log('Injecting headers into all HTML files...');
    const headerHtml = fs.readFileSync(HEADER_FILE, 'utf8');

    // Recursively find all HTML files
    function findHtmlFiles(dir) {
        let results = [];
        const list = fs.readdirSync(dir);
        list.forEach(file => {
            file = path.join(dir, file);
            const stat = fs.statSync(file);
            if (stat && stat.isDirectory()) {
                if (file.endsWith('/css') || file.endsWith('/js') || file.endsWith('/img') || file.endsWith('/scripts')) return;
                results = results.concat(findHtmlFiles(file));
            } else if (file.endsWith('.html') && !file.endsWith('header.partial.html')) {
                results.push(file);
            }
        });
        return results;
    }

    const htmlFiles = findHtmlFiles(FRONTEND_DIR);

    htmlFiles.forEach(file => {
        let content = fs.readFileSync(file, 'utf8');
        
        // Remove existing <header class="site-header"> if it exists (e.g. from console.html)
        content = content.replace(/<header class="site-header">[\s\S]*?<\/header>\n?/gi, '');
        // Also remove any other hardcoded <header> just in case
        content = content.replace(/<header>[\s\S]*?<\/header>\n?/gi, '');

        // Inject after <body>
        const bodyTag = '<body';
        const bodyIndex = content.indexOf(bodyTag);
        
        if (bodyIndex !== -1) {
            const endOfBodyTag = content.indexOf('>', bodyIndex) + 1;
            const before = content.substring(0, endOfBodyTag);
            const after = content.substring(endOfBodyTag);
            
            // Adjust paths in header if in a subdirectory
            const relativeToRoot = path.relative(path.dirname(file), FRONTEND_DIR);
            let adjustedHeader = headerHtml;
            
            if (relativeToRoot !== '') {
                // Not in root directory (e.g., guides/some-guide.html)
                // prefix hrefs and srcs
                adjustedHeader = adjustedHeader.replace(/href="\//g, `href="${relativeToRoot}/`);
                adjustedHeader = adjustedHeader.replace(/src="\//g, `src="${relativeToRoot}/`);
            } else {
                // In root directory, remove the leading slash for relative loading
                adjustedHeader = adjustedHeader.replace(/href="\//g, `href="`);
                adjustedHeader = adjustedHeader.replace(/src="\//g, `src="`);
            }
            
            content = before + '\n' + adjustedHeader + after;
            fs.writeFileSync(file, content, 'utf8');
            console.log(`Updated ${file}`);
        } else {
            console.warn(`Warning: No <body> tag found in ${file}`);
        }
    });
    console.log('Finished injecting headers.');
}

injectHeaders();
