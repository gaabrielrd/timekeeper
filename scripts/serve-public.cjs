const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const publicDirectory = path.resolve(__dirname, "../public");
const port = Number(process.env.PORT || 4173);
const contentTypes = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
".js": "text/javascript; charset=utf-8",
	".webmanifest": "application/manifest+json; charset=utf-8",
	".png": "image/png",
	".woff": "font/woff",
};

const server = http.createServer((request, response) => {
	const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
	const requestedPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
	const filePath = path.resolve(publicDirectory, requestedPath);
	if (!filePath.startsWith(`${publicDirectory}${path.sep}`)) {
		response.writeHead(403).end("Forbidden");
		return;
	}
	fs.readFile(filePath, (error, content) => {
		if (error) {
			response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
			response.end("Not found");
			return;
		}
		response.writeHead(200, {
			"Cache-Control": "no-cache, max-age=0, must-revalidate",
			"Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
		});
		response.end(content);
	});
});

server.listen(port, "127.0.0.1", () => {
	process.stdout.write(`Timekeeper test server: http://127.0.0.1:${port}\n`);
});

function shutdown() {
	server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
