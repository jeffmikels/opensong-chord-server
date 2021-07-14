const usedav = false
const url = "[webdav url]";
const username = "webdavuser";
const password = "webdavpassword";

// if serving this from a subdirectory, specify it here
// like /worshipchords/
// preserve the leading and trailing slashes
const directory = '/'

// preserve the final slash
const opensongdir = '/path/to/OpenSong/';

module.exports = {
	usedav,
	url,
	username,
	password,
	opensongdir,
	directory
}