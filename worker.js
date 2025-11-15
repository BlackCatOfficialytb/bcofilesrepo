// --- CONFIGURATION ---
// Replace with your GitHub username and repository name
const GITHUB_OWNER = "BlackCatOfficialytb"; 
const GITHUB_REPO = "bcofilesrepo";

// The branch to read from (usually 'main' or 'master')
const GITHUB_BRANCH = "main"; 

// Base URL for GitHub API
const GITHUB_API_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`;

// The domain where the worker is running (used for generating internal links)
// MUST match the domain/subdomain you set up a route for in Cloudflare
const WORKER_DOMAIN = "files.blackcatofficial.qzz.io"; 

// --- NEW WORKER CODE SNIPPET (Alternate) ---

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname.substring(1);
        
        // If the path is non-empty and does NOT end in a slash, treat it as a file.
        // This covers files with and without extensions.
        const isFile = path.length > 0 && !path.endsWith('/');

        if (isFile) {
            return handleFileDownload(path);
        } else {
            // If path is empty (root) or ends in a slash (directory)
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
        const lastSlash = currentPath.lastIndexOf('/');
        const parentPath = lastSlash > -1 ? currentPath.substring(0, lastSlash) : '';
        listItems += `
            <li>
                <span class="file-type dir-color">&lt;DIR&gt;</span>
                <a class="file-name" href="https://${WORKER_DOMAIN}/${parentPath}">..</a>
            </li>
        `;
    }

    contents.forEach(item => {
        const isDir = item.type === 'dir';
        const urlPath = item.path;
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

    // Updated: Using your revised CSS below!
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Index of /${currentPath}</title>
    <style>
        /* --- FULLY REVISED CSS FOR ALIGNMENT --- */
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
        /* Address Bar Styling (Keep this largely the same) */
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
        /* File List Styling */
        .file-list-area {
            padding: 10px;
        }
        /* Header Fix: Match the structure's spacing */
        .header-row {
            font-weight: bold;
            margin-bottom: 5px;
            border-bottom: 1px dashed #ccc;
            padding-bottom: 3px;
            /* Use padding to create the visual gap */
            padding-left: 10ch; 
        }
        #file-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        /* Item container */
        #file-list li {
            padding: 2px 0;
            display: flex; 
            align-items: baseline;
        }
        /* Type Column: Fixed width and right-aligned for visual consistency */
        .file-type {
            display: inline-block;
            width: 9ch; /* Increased slightly to 9ch to safely accommodate <FILE> and <DIR> */
            text-align: right; 
            color: #888;
            /* This padding creates the consistent space between Type and Name */
            padding-right: 1ch; 
        }
        /* Name Link: Starts immediately after the type column */
        .file-name {
            flex-grow: 1;
            color: #0000cc; 
            text-decoration: none;
        }
        .file-name:hover {
            text-decoration: underline;
        }
        .dir-color {
            color: #800080; 
        }
        /* --- END REVISED CSS --- */
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
