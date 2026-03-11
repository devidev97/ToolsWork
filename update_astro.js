const fs = require('fs');

const astroFile = '/Users/david/Desktop/ToolsWork/src/components/actualizar-tripulantes/ActualizarTripulantes.astro';
const htmlFile = '/Users/david/Desktop/ToolsWork/index.html';

const htmlContent = fs.readFileSync(htmlFile, 'utf8');
const astroContent = fs.readFileSync(astroFile, 'utf8');

// Extract all content inside the <body> tag from index.html
const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/);
if (!bodyMatch) {
    console.error("No body found");
    process.exit(1);
}

const newBodyContent = bodyMatch[1].trim();

// Keep the Astro frontmatter
const astroFrontmatterMatch = astroContent.match(/^(---[\s\S]*?---\n)/);
if (!astroFrontmatterMatch) {
    console.error("No Astro frontmatter found");
    process.exit(1);
}

const newAstroContent = astroFrontmatterMatch[1] + '\n' + newBodyContent + '\n';

fs.writeFileSync(astroFile, newAstroContent);
console.log("SUCCESS");
