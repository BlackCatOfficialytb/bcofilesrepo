// --- CONFIGURATION ---
// Replace with your GitHub username and repository name
const GITHUB_OWNER = "your-username"; 
const GITHUB_REPO = "your-repo-name";

// The branch to read from (usually 'main' or 'master')
const GITHUB_BRANCH = "main"; 

// Base URL for GitHub API
const GITHUB_API_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`;

// The domain where the worker is running (used for generating internal links)
// MUST match the domain/subdomain you set up a route for in Cloudflare
const WORKER_DOMAIN = "files.mydomain.com"; 

// --- HANDLER ---
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname.substring(1); // Remove leading '/'

        if (path.endsWith('.txt') || path.endsWith('.pdf') || path.endsWith('.zip') || path.endsWith('.mp4')) {
            // 2. Handle Direct Download Requests
            return handleFileDownload(path);
        } else {
            // 1. Handle Directory Browsing Requests
            return handleDirectoryListing(path);
        }
    },
};

// ----------------------------------------------------------------------
// 1. DIRECTORY LISTING FUNCTION (File Browser UI)
// ----------------------------------------------------------------------

async function handleDirectoryListing(path) {
    const api_url = `${GITHUB_API_BASE}/${path}?ref=${GITHUB_BRANCH}`;

    // IMPORTANT: The User-Agent is required by the GitHub API
    const response = await fetch(api_url, {
        headers: {
            'User-Agent': 'Cloudflare-Worker-File-Browser',
        },
    });

    if (response.status === 404) {
        return new Response('404 Not Found: Directory or file does not exist.', { status: 404 });
    }
    if (!response.ok) {
        return new Response('Error fetching GitHub contents.', { status: response.status });
    }

    const contents = await response.json();
    
    // Sort directories first, then files
    contents.sort((a, b) => {
        if (a.type === 'dir' && b.type !== 'dir') return -1;
        if (a.type !== 'dir' && b.type === 'dir') return 1;
        return a.name.localeCompare(b.name);
    });

    const htmlContent = generateHtml(contents, path);
    return new Response(htmlContent, {
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
        },
    });
}

// ----------------------------------------------------------------------
// 2. DIRECT DOWNLOAD/PROXY FUNCTION
// ----------------------------------------------------------------------

async function handleFileDownload(path) {
    // Construct the Raw GitHub URL for direct file content
    const raw_url = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${path}`;

    // Fetch the file content from the raw GitHub URL
    const response = await fetch(raw_url);

    if (!response.ok) {
        return new Response('404 File Not Found', { status: 404 });
    }

    // Clone the response to modify headers while preserving the body
    const finalResponse = new Response(response.body, response);

    // Set headers to force download and fix Content-Type
    finalResponse.headers.set('Content-Disposition', `attachment; filename="${path.split('/').pop()}"`);
    finalResponse.headers.set('Content-Type', finalResponse.headers.get('Content-Type') || 'application/octet-stream');
    
    // Cloudflare Caching is HIGHLY recommended here for low latency on subsequent requests
    finalResponse.headers.set('Cache-Control', 'public, max-age=3600, must-revalidate'); // Cache for 1 hour

    return finalResponse;
}

// ----------------------------------------------------------------------
// 3. HTML GENERATION (The "file:///" look and feel)
// ----------------------------------------------------------------------

function generateHtml(contents, currentPath) {
    let listItems = '';
    
    // Add ".." link if not in the root directory
    if (currentPath && currentPath !== '/') {
        const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
        listItems += `
            <li>
                <span class="file-type dir-color"><DIR></span>
                <a class="file-name" href="https://${WORKER_DOMAIN}/${parentPath}">..</a>
            </li>
        `;
    }

    contents.forEach(item => {
        const isDir = item.type === 'dir';
        const urlPath = isDir ? item.path : item.path;
        
        listItems += `
            <li>
                <span class="file-type ${isDir ? 'dir-color' : ''}">
                    ${isDir ? '&lt;DIR&gt;' : '&lt;FILE&gt;'}
                </span>
                <a class="file-name" href="https://${WORKER_DOMAIN}/${urlPath}">
                    ${item.name}
                </a>
            </li>
        `;
    });

    // The simple, file-browser style HTML/CSS
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Index of /${currentPath}</title>
    <style>
        body {
            font-family: monospace;
            background-color: #f0f0f0;
            margin: 20px;
        }
        .browser-container {
            width: 80%;
            max-width: 800px;
            margin: 0 auto;
            border: 1px solid #ccc;
            box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.1);
            background-color: #fff;
        }
        .address-bar {
            display: flex;
            align-items: center;
            padding: 8px;
            border-bottom: 1px solid #ccc;
            background-color: #e9e9e9;
        }
        .protocol {
            font-weight: bold;
            margin-right: 5px;
            color: #555;
        }
        .path-display {
            flex-grow: 1;
            padding: 3px;
            background-color: #fff;
            border: 1px solid #aaa;
            font-family: monospace;
            white-space: nowrap;
            overflow: hidden;
        }
        .file-list-area {
            padding: 10px;
        }
        .header-row {
            font-weight: bold;
            margin-bottom: 5px;
            border-bottom: 1px dashed #ccc;
            padding-bottom: 3px;
        }
        #file-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        #file-list li {
            padding: 2px 0;
            display: flex;
            white-space: pre; 
        }
        .file-type {
            display: inline-block;
            width: 8ch; 
            color: #888;
        }
        .file-name {
            color: #0000cc; 
            text-decoration: none;
        }
        .file-name:hover {
            text-decoration: underline;
        }
        .dir-color {
            color: #800080; 
        }
    </style>
</head>
<body>
    <div class="browser-container">
        <div class="address-bar">
            <span class="protocol">https://</span>
            <div class="path-display">${WORKER_DOMAIN}/${currentPath}</div>
        </div>

        <div class="file-list-area">
            <pre class="header-row">Type      Name</pre>
            <ul id="file-list">
                ${listItems}
            </ul>
        </div>
    </div>
</body>
</html>
    `;
}
