// THIS APP RESPONDS TO AND BROADCASTS KIDOPOLIS CHECKINS
// SET UP THE BASIC NODE APP WITH SOCKET SUPPORT
const fs = require('fs')
	, util = require('util')
	, url = require('url')
	// , qs = require('querystring')

const stat = util.promisify(fs.stat);
const readdir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);

// cache datastore
const cache = {}

// webdav configuration
const config = require('./conf');
let davClient
if (config.usedav) {
	const webdav = require("webdav");
	davClient = webdav.createClient(
		config.url + config.opensongdir,
		{
			username: config.username,
			password: config.password
		}
	);
}

const WebSocket = require('ws')

// SET UP LOGGING TO CONSOLE AND ALSO TO FILE
const log_file = fs.createWriteStream(__dirname + '/debug.log', {flags : 'a'});
const log_stdout = process.stdout;

// OVERLOAD THE Log FUNCTION WITH OUR CUSTOM ONE
Log = function(d) {
	var now = new Date()
	var s = now.toISOString() + ': ' + util.format(d) + '\n';
	log_file.write(s);
	log_stdout.write(s);
};

// GLOBAL SETTINGS & CONFIGURATION DATA
const LISTEN_PORT = 8083;

// remember the trailing slash in the configuration file
const OpenSongDir = config.opensongdir;


// SETTING UP GLOBAL VARIABLES AND APP PROPERTIES
const app = require('http').createServer(handler)

/* START THE NATIVE WEBSOCKET SERVER */
const ws_connections = [];
const ws_channels = {};
const wss = new WebSocket.Server({
	server: app,
	clientTracking: true,
});

// send keepalive pings
const interval = setInterval(function ws_ping() {
	wss.clients.forEach(function each(ws) {
		if (ws.isAlive === false) return ws.terminate();
		ws.isAlive = false;
		ws.ping(noop);
	});
}, 30000);

// setup real wss listeners
wss.on('connection', function connection(ws) {
	ws.isAlive = true;
	ws.isWS = true;
	ws.subscription = '';
	ws.on('pong', heartbeat);
	
	ws_connections.push(ws);
	ws.on('message', function incoming(raw_message) {
		// to simulate socket.io
		// each "data" will be a JSON encoded dictionary
		// like this:
		// {'message': [string message], 'data': [submitted data]}
		Log('received: message')
		Log(raw_message);
		
		var json = JSON.parse(raw_message);
		var message = json.message;
		var data = json.data;
		
		if (message == 'text') {
			broadcast('text', data);
		}
	});
});


/* INITIALIZE AND START THE SOCKET.IO LISTENER */
Log('---------- SERVER STARTING --------------')
Log(':: ' + Date())
Log('-----------------------------------------')

// START THE LISTENER
app.listen(LISTEN_PORT);


/* FUNCTION DECLARATIONS */
// serve static files from this directory
// API DOCUMENTATION
/*

/ or /index.html  => serve index.html
/static          => serves static files from the static subdirectory
/Sets            => serves list of Setlists
/Sets/NAME       => serves data for Setlist identified by NAME
/Songs           => serves list of Songs [ BROKEN ]

QUERY VARIABLES
?usecache=1      => will use the most recently cached data for a request
?filter=a,b,...  => will filter the results, multiple filters with comma

SONG FILTERS:
pre-alternates   => ignores all songs following a song with ALTERNATES in the title
ccli-only        => ignores all songs without ccli data
no-lyrics        => strips lyrics data from songs before returning

SET FILTERS:
text             => includes sets where the title contains text (case insensitive)
!text            => excludes sets where the title contains text (case insensitive)


*/
async function handler (req, res)
{
	res.setHeader('Access-Control-Allow-Origin', 'https://lafayettecc.org');
	res.setHeader('Access-Control-Allow-Credentials', 'true');

	let {pathname, query} = url.parse(req.url, true);
	Log(pathname);
	Log('QUERY: ' + JSON.stringify(query));
	
	// remove worshipchords at the beginning and the slash following it (if there is a slash)
	let path = pathname;
	path = path.replace(/\/worshipchords\/*/,'')
	
	// remove trailing slash
	path = decodeURI(path.replace(/\/$/,''))
	Log(`REQUESTED PATH: ${path}`);
	
	if (path == '' || path == 'index.html') {
		Log('sending index.html');
		fs.readFile(__dirname + '/index.html', {encoding:'utf-8'}, function(err,data){
			if (err) {
				res.writeHead(404)
				return res.end(JSON.stringify(err))
			}
			
			res.writeHead(200)
			return res.end(data)
		});
		return;
	}
	
	// ignore all directories but Sets and Songs and "static"
	if (! path.match(/Sets|Songs|static/)) {
		res.writeHead(403)
		return res.end('SETS AND SONGS ARE THE ONLY ALLOWED DIRECTORIES');
	}
	
	if (path.match(/static\/.*\.js/)) {
		console.log('attempting to serve a static js file')
		console.log(path);
		let fstream = fs.createReadStream(path);
		res.statusCode = '200';
		res.setHeader('Content-Type', 'text/javascript');
		fstream.pipe(res);
		return;
	}
	
	// is this click.wav
	if (path.match(/static\/click\.wav/)) {
		let fstream = fs.createReadStream('static/click.wav');
		res.statusCode = '200';
		res.setHeader('Content-Type', 'audio/wav');
		fstream.pipe(res);
		return;
	}
	
	try {
		let data
		if (query.usecache && path in cache) {
			Log('using data from cache');
			data = cache[path];
		}
		else {
			Log('getting new data for path')
			data = await handlePath(path);
			cache[path] = data;
		}
		
		if (query.filter) data.data = dataFilter(data.data, query.filter)

		res.writeHead(data.code);
		return res.end(JSON.stringify(data.data))
	} catch (e) {
		res.end();
	}
}

function dataFilter(data, filters) {
	
	// SONG FILTERS
	if ('songs' in data) {
		for (let filter of filters.split(',')) {
			let filtered
			switch (filter) {
				case 'pre-alternates':
					Log('FILTER: pre-alternates ... keeping songs before "ALTERNATES"')
					filtered = []
					let keep_going = true
					for (let song of data.songs) {
						if (song.title.match(/alternates/i)) {
							keep_going = false
						};
						if (keep_going) filtered.push(song)
					}
					data.songs = filtered;
					break;
				case 'ccli-only':
					Log('FILTER: ccli-only ... keeping only songs with CCLI data')
					filtered = []
					for (let song of data.songs) {
						if (song.ccli == '') continue;
						filtered.push(song)
					}
					data.songs = filtered;
					break;
				case 'no-lyrics':
					Log('FILTER: no-lyrics ... removes the "lyrics" field')
					filtered = []
					for (let song of data.songs) {
						delete song.lyrics;
						filtered.push(song)
					}
					data.songs = filtered;
					break;
			}
		}
	}
	
	// SETLIST FILTERS
	if ('files' in data) {
		for (let filter of filters.split(',')) {
			let filtered = []
			let invert = false;
			if (filter.substring(0,1) == '!') {
				invert = true;
				filter = filter.substring(1)
			}
			
			Log(`FILTER: will ${invert ? 'include':'exclude' } sets matching "${filter}"`)
			r = RegExp(filter, 'i');
			for (let file of data.files) {
				let match = file.name.match(r);
				if ( match !== null && !invert) {
					Log('including: ' + file.path)
					filtered.push(file)
				} else if (match == null && invert) {
					Log('including: ' + file.path)
					filtered.push(file)
				} else {
					Log('excluding: ' + file.path)
				}
			}
			data.files = filtered;
		}
	}
	return data;
}

async function handlePath(path) {
	Log('Attempting to get requested file');
	let data;
	if (config.usedav) data = handleDav(path);
	else data = handleLocal(path);
	return data;
}


async function handleDav(path) {
	Log(`Connecting to Seafile DAV server: ${path}`)
	if (await davClient.exists(path)) {
		let stat = await davClient.stat(path);
		if (stat.type == 'directory') {
			Log('found directory');
			Log(`${path} => ${stat.filename}`);
			try {
				let data = await walkDavDir(path);
				let code = 200
				return {code, data}
				// res.writeHead(200);
				// return res.end(JSON.stringify(data));
			}
			catch (e) {
				Log(e)
				return {code:500, err: `could not handle ${path}`, data:{}}
				// res.writeHead(500);
				// return res.end();
			}
		} else {
			let data = {}
			stat.time = new Date(stat.lastmod)
			if (path.match(/Sets/)) data = await loadDavSet(path);
			else if (path.match(/Songs/)) data = await loadDavSong(path);
			else {
				let code = 403
				let err = 'not allowed'
				return {code, err, data}
				// res.writeHead(403);
				// return res.end('{"err":"not allowed"}');
			}
			let code = 200
			return {code, data}
			// res.writeHead(200);
			// return res.end(JSON.stringify(retval))
		}
	} else {
		return {code: 404, err: 'file not found', data: {}}
		// res.writeHead(404);
		// return res.end();
	}
}

async function handleLocal(path) {
	Log('Grabbing local file...')
	fs.stat(path, (err, stats) => {
		if(stats.isDirectory()) {
			Log('found directory');
			Log(`${path} => ${stat.filename}`);
		}
	})
	if (await fs.fileExists(path)) {
		let stat = await davClient.stat(path);
		if (stat.type == 'directory') {
			Log('found directory');
			Log(`${path} => ${stat.filename}`);
			try {
				let data = await walkDavDir(path);
				return {code: 200, data}
				// res.writeHead(200);
				// return res.end(JSON.stringify(data));
			}
			catch (e) {
				Log(e)
				return {code:500, err: `could not handle ${path}`, data:{}}
				// res.writeHead(500);
				// return res.end();
			}
		} else {
			let data = {}
			stat.time = new Date(stat.lastmod)
			if (path.match(/Sets/)) data = await loadDavSet(path);
			else if (path.match(/Songs/)) data = await loadDavSong(path);
			else {
				let code = 403
				let err = 'not allowed'
				return {code, err, data}
				// res.writeHead(403);
				// return res.end('{"err":"not allowed"}');
			}
			return {code: 200, data}
			// res.writeHead(200);
			// return res.end(JSON.stringify(retval))
		}
	} else {
		return {code: 404, err: 'file not found', data:{}}
		// res.writeHead(404);
		// return res.end();
	}
}


async function walkDavDir(path) {
	Log(`WALKING DIRECTORY: ${path}`);
	let retval = {root:path, dirs: [], files:[]};
	try {
		let items = await davClient.getDirectoryContents(path); // returns Array<Stat>
	
		// the first item is the stat of the directory itself
		items.shift()
		for (let item of items) {
			// ignore files beginning with a dot
			if (item.basename.match(/^\./)) continue;
		
			// add a time field to the item
			item.time = new Date(item.lastmod)
			Log(item.basename);
		
			if (item.type == 'directory') {
				let p = path + '/' + item.basename
				let data = walkDavDir(p);
				retval.dirs.push(data);
			}
			else {
				retval.files.push({
					path: path + '/' + item.basename,
					name: item.basename,
					time: item.time,
					davitem: item,
				})
			}
		}
	} catch(e) {
		Log(e)
	}
	
	// sort files by time before returning
	retval.files.sort((a,b)=>{
		return (a.time < b.time) ? 1 : -1 
	});
	return retval;
}

function walkDir(rootPath) {
	let retval = {root: rootPath, dirs: [], files:[]};
	let localroot = OpenSongDir + rootPath;
	Log(localroot);
	let st = fs.statSync(localroot);
	let items = fs.readdirSync(localroot);
	for (let item of items) {
		if (item.match(/^\./)) continue;
		
		let p = rootPath + '/' + item;
		Log(p);
		let itemstat = fs.statSync(OpenSongDir + '/' + p);
		if (itemstat.isDirectory()) {
			let data = walkDir(p);
			retval.dirs.push(data);
		}
		else if (itemstat.isFile()) {
			retval.files.push({
				name: item,
				time: itemstat.mtime.getTime(),
			})
		}
	}
	return retval;
}

function getTagContent(xml, tag) {
	let re = new RegExp('<'+tag+'>(.*?)<\/'+tag+'>', 's') //dotAll
	let res = xml.match(re);
	if (res)
		return res[1]
	return '';
}

async function loadDavSong(path) {
	try {
		let xmldata = await davClient.getFileContents(path);
		let song = parseSongXML(xmldata.toString());
		if (song != null) song.path = path;
		return song;
	} catch (e) {
		// Log(e);
		Log(`error opening dav file: ${path}`);
		return null;
	}
}

function loadSong(path) {
	let fullPath = OpenSongDir + path;
	try {
		let xmldata = fs.readFileSync(fullPath, {encoding: 'utf-8'});
		let song = parseSongXML(xmldata);
		if (song != null) song.path = path;
		return song;
	} catch (e) {
		// Log(e);
		Log(`error opening file: ${fullPath}`);
		return null;
	}
}

function parseSongXML(xmldata) {
	let chordletters = 'A A# B C C# D D# E F F# G G# A Bb B C Db D Eb E F Gb G Ab'.split(' ');
	let real_key_map = [12,13,14,15,16,17,18,19,20,9,22,23];
	chordletters.concat(chordletters)
	let song = {}
	try {
		xmldata = xmldata.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
		song.title = getTagContent(xmldata,'title');
		song.author = getTagContent(xmldata,'author');
		song.ccli = getTagContent(xmldata,'ccli');
		song.copyright = getTagContent(xmldata,'copyright');
		song.presentation = getTagContent(xmldata,'presentation');
		song.tempo = getTagContent(xmldata,'tempo');
		song.lyrics = getTagContent(xmldata,'lyrics');
		
		// ignore keys specified in the file, after transposing, they will be out of date
		// song.key = getTagContent(xmldata,'key');

		// also ignore the capo data
		// song.transpose = getTagContent(xmldata,'capo');
		
		// sometimes, we use extra newlines for the printed
		// version of the lyrics, but we don't need them for display
		song.lyrics = song.lyrics.replace(/\n(\s*\n)+/g, '\n\n')
		
		song.abc = '';
		
		// set up ABC notation regex
		// abc is assumed to take up the entire end of the document
		let abc = /%abc(.*)/gsi;
		let abcmatch = abc.exec(song.lyrics);
		if (abcmatch){
			// clean up initial characters that might be added by opensong
			song.abc = abcmatch[1].replace(/(\n|^)[;\s.]/g, '$1');
			song.lyrics = song.lyrics.replace(abcmatch[0], '');
		}
		
		
		// if song has no bpm specified in the file, compute it now
		if (!song.bpm) {
			Log(`Computing BPM for ${song.title}`);
			// Log(song.lyrics)
			let re = new RegExp(/;\s*(\d+)\s*BPM|;\s*BPM\s*:?\s*(\d+)/gmi)
			let match = re.exec(song.lyrics);
			if (match) {
				// Log(match);
				if (match[1]) song.bpm = parseInt(match[1]);
				else if (match[2]) song.bpm = parseInt(match[2]);
				Log(`BPM: ${song.bpm}`);
			} else {
				Log('No bpm information found');
				song.lyrics = ';BPM UNKNOWN\n' + song.lyrics;
			}
		}
		
		// look for a key override tag combination in the song
		let r = /\[(?:k|key)\][\n\r]+\.\s*(\S+)\s*/i
		let m = r.exec(song.lyrics)
		if (m) {
			let cletter = m[1];
			song.key = cletter;
			Log(`Key Override Tag Detected. Root is ${song.key}.`)
			song.lyrics = song.lyrics.replace(r, '');
		}
		
		// if we still don't have a key, compute it now
		if (!song.key){
			Log(`Computing Key for ${song.title}`)
			let possible = [];
			let seen = [];
			// to compute the key:
			// for the first chord, compute the possible keys
			// for each subsequent chord, remove impossible keys until one remains
			// once a key is computed... exit the loop
			
			// label for interior breakpoints
			keySearch:
			for (let line of song.lyrics.split('\n')) {
				if (line.substring(0,1) == '.') {
					// Log(line);
					// let cs = /[^\/\.](([ABCDEFG][b#]?)(m(?!a))?[^\s\/]*)/g;
					// ignore bass chords (immediately following a slash)
					let cs = /[^\/](([ABCDEFG][b#]?)(maj7|Maj7|M7|m)?[^\s\/]*)/g;
					let m;
					while (1) {
						m = cs.exec(line);
						if (m) {
							let cname = m[1];
							if (seen.indexOf(cname) >= 0) continue;
							seen.push(cname);
							let cletter = m[2];
							let color = m[3];
							color = color ? color : 'major';
							if (color == 'Maj7' || color == 'M7') color = 'maj7';
							if (color == 'm') color = 'minor';
							
							Log(`Found Chord: ${cname} => ${cletter} (${color})`)
							let cindex = chordletters.indexOf(cletter)
							if (cindex >= 0) {
								// is this the first chord we have seen?
								if (possible.length == 0) {
									possible = keySemitonesFromChord(cindex, color);
									let pos_string = possible.map((e)=>chordletters[e]);
									Log(`${cname} => ${pos_string}`);
									continue;
								} else {
									new_possible = keySemitonesFromChord(cindex, color);
									possible = possible.filter((e) => new_possible.indexOf(e) != -1);
									let pos_string = possible.map((e)=>chordletters[e]);
									Log(`${cname} => ${pos_string}`);
									if (possible.length == 1) {
										break keySearch;
									}
								}
							}
						} else {
							break;
						}
					}
				}
			}
			
			if (possible.length > 0) {
				// only use flat key signatures except for F#
				let real_key_index = possible[0] + 12;
				if (real_key_index == 9+12) real_key_index = 9; // CHANGE Gb to F#
				song.key = chordletters[real_key_index];
				let verb = '';
				if (possible.length == 1) {
					Log(`Determined Key Is: ${song.key}`);
					verb = 'AUTO-COMPUTED';
				}
				else {
					Log(`Guessed Key Is: ${song.key}`);
					verb = 'GUESSED';
				}
				song.lyrics = `;SAVED KEY: ${song.key} (${verb})\n` + song.lyrics;
			}
			else {
				Log('Key could not be determined.')
			}
		}
		return song;
	} catch (e) {
		// Log(e);
		Log(`error parsing file: ${fullPath}`);
		return null;
	}
}

async function loadDavSet(path) {
	try {
		let xmldata = await davClient.getFileContents(path);
		let setData = await parseSetXML(xmldata.toString(), true);
		setData.path = path;
		return setData;
	} catch (e) {
		Log(e);
		Log('error loading set');
		return null;
	}
}


function loadSet(path) {
	let localroot = OpenSongDir + path;
	try {
		let xmldata = fs.readFileSync(localroot, {encoding: 'utf-8'});
		let setData = parseSetXML(xmldata);
		setData.path = path;
		return setData;
	} catch (e) {
		Log(e);
		Log('error loading set');
		return null;
	}
}

async function parseSetXML(xmldata, useDav=false) {
	try{
		Log(xmldata);
		let setData = {songs:[]};
		
		// get set name
		let t = xmldata.match(/<set name="(.*?)".*?>/)
		setData.name = t[1];
		
		
		// get set songs
		let matches = xmldata.match(/<slide_group .*?\/>/g)
		for (let slide_group of matches) {
			let name = '';
			let presentation = '';
			let type = '';
			let path = '';
			let t = slide_group.match(/name="(.*?)"/);
			if (t) name = t[1];
			
			t = slide_group.match(/presentation="(.*?)"/);
			if (t) presentation = t[1];
			
			t = slide_group.match(/type="(.*?)"/);
			if (t) type = t[1];
			if (type != 'song') continue;
			
			t = slide_group.match(/path="(.*?)"/);
			if (t) {
				path = 'Songs/' + t[1] + '/' + name;
				path = path.replace(/\/\//,'/') // replace double slashes
				Log(path);

				let newsong;
				if (useDav) newsong = await loadDavSong(path);
				else newsong = loadSong(path);

				if (newsong == null) {
					newsong = {
						path: path,
						title: name,
						lyrics: `;FILE NOT FOUND ON SERVER:\n;"${path}"`,
					}
				}
				if (presentation != '') newsong.presentation = presentation;
				setData.songs.push(newsong)
			}
		}
		return setData;
	} catch (e) {
		Log(e);
		Log('error parsing set');
	}
}

// return possible keys for each chord
function keySemitonesFromChord(chord_semi, color) {
	if (color == 'minor') {
		// minor chords might be the third, second, or sixth of the scale
		return [
			(chord_semi + 3) % 12,
			(chord_semi + 12 - 2) % 12,
			(chord_semi + 12 - 4) % 12,
		];
	} else if (color == 'maj7' ){
		// major7 chords are usually the 6m with a 4 added
		// so they usually function as the fourth of the scale
		// but they are also in the scale of the 6m
		// since we don't report minor keys, for now, we just guess the 4
		return [
			(chord_semi + 12 - 5) % 12,
		];
	} else {
		// major chords are usually the 1, 4, 5 of the scale
		return [
			chord_semi % 12,
			(chord_semi + 12 - 5) % 12,
			(chord_semi + 12 - 7) % 12,
		];
	}
}


function ping()
{
	// backend has been updated and we have received a ping
	Log('sending "myping" message');
	io.sockets.emit('myping', Date.now());
	socket_send('myping',Date.now());
	maybe_refresh();
}

// native websocket functions
function ws_send(conn, msg, data)
{
	try {
		var message = {'message':msg, 'data':data};
		message = JSON.stringify(message);
		if (conn.readyState === WebSocket.OPEN && conn.isAlive) conn.send(message);
	}
	catch (e) {
		Log('sending socket failed: message attempted was as follows');
		Log(msg)
	}
}

function broadcast(message, data) {
	wss.clients.forEach(function(client){
		ws_send(client, message, data);
	});
}

function noop() {}

function heartbeat() {
  this.isAlive = true;
}