const fs = require('fs');
const css = fs.readFileSync('dist/app.css', 'utf8');
const js = fs.readFileSync('dist/app.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const html = `<title>School OS Design</title>
<meta name="description" content="Clickable UI design preview of School OS for Sunrise Public School">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Figtree:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap">
<style>${css}</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>${js}</script>
`;
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/school-os-ui.html', html);
console.log('html', (html.length / 1024).toFixed(0) + 'KB');
