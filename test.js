// webdav configuration
const webdav = require("webdav");
const config = require('./conf');
const seafileDav = webdav.createClient(
	config.url + config.opensongdir,
	{
		username: config.username,
		password: config.password
	}
);

async function main() {
	let items = await seafileDav.getDirectoryContents('/Sets');
	items.shift()
	console.log(items)
}

main();