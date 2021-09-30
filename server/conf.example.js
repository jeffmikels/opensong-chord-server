// engine should be pco (Planning Center) or opensong
// pco will auto-convert from the chordpro format
// and will use the api to access data
// opensong will use the filesystem or webdav
// to access its files
const engine = 'pco';

// port to listen on
const port = 8083;

// pco config
// remember to keep the apikey and secret secret!!
const pco = {
	apikey: '',
	secret: '',
}


// opensong_config
// ignored if the engine is 'pco'
// method should be dav (webdav) or fs (filesystem)
// path will be appended to dav_url
// or will be used directly by the fs module (preserve trailing slash)
// dav_ items are required if method is dav
const opensong = {
	method: 'fs',
	path: 'relative/path/to/OpenSong/',
	dav_url: "[webdav url]",
	dav_username: "webdavuser",
	dav_password: "webdavpassword",
}

// if serving this from a subdirectory, specify it here
// like /worshipchords/
// preserve the leading and trailing slashes
const basepath = '/';


module.exports = {
	engine,
	pco,
	opensong,
	basepath,
	port,
}
