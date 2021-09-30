// THIS APP RESPONDS TO AND BROADCASTS KIDOPOLIS CHECKINS
// SET UP THE BASIC NODE APP WITH SOCKET SUPPORT
const fs = require( 'fs' )
	, util = require( 'util' )
	, url = require( 'url' )

const stat = util.promisify( fs.stat );
const readdir = util.promisify( fs.readdir );
const readFile = util.promisify( fs.readFile );

// for communicating with the frontend
const WebSocket = require( 'ws' )

// My imports
const { PlanningCenter } = require( './pco' );
const { OpenSong } = require( './opensong' );

// GLOBAL SETTINGS & CONFIGURATION DATA
const config = require( './conf' );
const LISTEN_PORT = config.port;

// cache datastore
const cache = {}


// SET UP LOGGING TO CONSOLE AND ALSO TO FILE
const log_file = fs.createWriteStream( __dirname + '/debug.log', { flags: 'a' } );
const log_stdout = process.stdout;

// OVERLOAD THE Log FUNCTION WITH OUR CUSTOM ONE
const Log = function ( d ) {
	var now = new Date()
	var s = now.toISOString() + ': ' + util.format( d ) + '\n';
	log_file.write( s );
	log_stdout.write( s );
};


// Setup Backend
let backend;
if ( config.engine == 'pco' ) {
	backend = new PlanningCenter( config.pco );
} else {
	backend = new OpenSong( config.opensong );
}

// SETTING UP GLOBAL VARIABLES AND APP PROPERTIES
const app = require( 'http' ).createServer( handler )

/* START THE NATIVE WEBSOCKET SERVER */
const ws_connections = [];
const ws_channels = {};
const wss = new WebSocket.Server( {
	server: app,
	clientTracking: true,
} );

// handle sending keepalive pings
const interval = setInterval( function ws_ping() {
	wss.clients.forEach( function each( ws ) {
		if ( ws.isAlive === false ) return ws.terminate();
		ws.isAlive = false;
		ws.ping( noop );
	} );
}, 30000 );

// setup real wss listeners
wss.on( 'connection', function connection( ws ) {
	ws.isAlive = true;
	ws.isWS = true;
	ws.subscription = '';
	ws.on( 'pong', heartbeat );

	ws_connections.push( ws );
	ws.on( 'message', function incoming( raw_message ) {
		// to simulate socket.io
		// each "data" will be a JSON encoded dictionary
		// like this:
		// {'message': [string message], 'data': [submitted data]}
		Log( 'received: message' )
		Log( raw_message );

		var json = JSON.parse( raw_message );
		var message = json.message;
		var data = json.data;

		if ( message == 'text' ) {
			broadcast( 'text', data );
		}
	} );
} );


// PRIME THE SETLIST CACHE
primeSetlistCache()
setInterval( primeSetlistCache, 1000 * 60 * 60 * 24 ) // every day


/* INITIALIZE AND START THE SOCKET.IO LISTENER */
Log( '---------- SERVER STARTING --------------' )
Log( ':: ' + Date() )
Log( '-----------------------------------------' )

// START THE LISTENER
app.listen( LISTEN_PORT );


/* FUNCTION DECLARATIONS */
// serve static files from this directory
// API DOCUMENTATION
/*

/ or /index.html  => serve index.html
/static          => serves static files from the static subdirectory
/Sets            => serves list of Setlists
/Sets/NAME       => serves data for Setlist identified by NAME
/Sets/--today--  => will replace --today-- with today's date YYYY-MM-DD before making request
/Sets/--latest-- => will serve the most recent setlist (see implementation below for notes on caching)
/Songs           => serves list of Songs [ BROKEN ]

QUERY VARIABLES
?usecache=1      => will use the most recently cached data for a request
?filter=a,b,...  => will filter the results, multiple filters with comma (applied in order)

SONG FILTERS:
pre-alternates   => ignores all songs following a song with ALTERNATES in the title
no-duplicates    => includes only the first instance of a song in a setlist (based on title)
no-lyrics        => strips lyrics data from songs before returning
ccli-only        => ignores all songs without ccli data

SET FILTERS:
text             => includes sets where the title contains text (case insensitive)
!text            => excludes sets where the title contains text (case insensitive)


*/
async function handler( req, res ) {
	// res.setHeader('Access-Control-Allow-Origin', 'https://lafayettecc.org');
	res.setHeader( 'Access-Control-Allow-Origin', '*' );
	res.setHeader( 'Access-Control-Allow-Credentials', 'true' );

	let { pathname, query } = url.parse( req.url, true );

	// remove directory name from the full path
	let path = pathname;
	path = path.replace( RegExp( `^${config.basepath}/?` ), '' )

	// remove leading slashes
	path = path.replace( /^\/+/, '' );

	// remove trailing slash
	path = decodeURI( path.replace( /\/$/, '' ) )

	Log( '=========== NEW REQUEST ===========' )
	Log( 'PATH: ' + path )
	Log( 'QUERY: ' + JSON.stringify( query ) );

	if ( path == '' || path == '/' || path == 'index.html' ) {
		Log( 'sending index.html' );
		fs.readFile( __dirname + '/../index.html', { encoding: 'utf-8' }, function ( err, data ) {
			if ( err ) {
				res.writeHead( 404 )
				return res.end( JSON.stringify( err ) )
			}

			res.writeHead( 200 )
			return res.end( data )
		} );
		return;
	}

	// ignore all directories but Sets and Songs and "static"
	if ( !path.match( /Sets|Songs|static/ ) ) {
		res.writeHead( 403 )
		return res.end( 'SETS AND SONGS ARE THE ONLY ALLOWED DIRECTORIES' );
	}

	if ( path.match( /static\/.*\.js/ ) ) {
		console.log( 'attempting to serve a static js file' )
		let realpath = __dirname + '/../' + path;
		console.log( realpath );
		fs.readFile( realpath, { encoding: 'utf-8' }, function ( err, data ) {
			if ( err ) {
				res.writeHead( 404 )
				return res.end( JSON.stringify( err ) )
			}

			res.setHeader( 'Content-Type', 'text/javascript' );
			res.writeHead( 200 )
			return res.end( data )
		} );
		return;
	}

	// is this click.wav
	if ( path.match( /static\/click\.wav/ ) ) {
		let realpath = __dirname + '/../' + path;
		console.log( realpath );
		let fstream = fs.createReadStream( realpath );
		res.statusCode = '200';
		res.setHeader( 'Content-Type', 'audio/wav' );
		fstream.pipe( res );
		return;
	}

	try {
		let data

		// TWO SPECIAL REWRITES ARE AVAILABLE :: --today-- and --latest--

		// allow user to request --today-- for a setlist labeled by today's date
		// this rewrite happens before the cache is checked
		if ( path == 'Sets/--today--' ) {
			let now = new Date();
			let year = now.getFullYear()
			let month = ( 1 + now.getMonth() ).toString().padStart( 2, '0' )
			let day = now.getDate().toString().padStart( 2, '0' )
			path = `Sets/${year}-${month}-${day}`
			Log( 'REWRITE Sets/--today-- TO: ' + path )
		}

		// allow user to request --latest-- for the most recent setlist
		// first, it gets the list of setlists, and then grabs the most recent one
		// note, since this requires two requests it has caching problems
		// if usecache is set, it will attempt to use the cache for each request
		if ( path == 'Sets/--latest--' ) {
			let setsdata = await getPathFromBackend( 'Sets', query.useCache );
			if ( setsdata.code == 200 ) {
				path = setsdata.data.files[ 0 ].path;
			} else {
				res.writeHead( 404 );
				return res.end( JSON.stringify( { code: 404, err: 'could not load latest setlist', data: {} } ) );
			}
			Log( 'REWRITE Sets/--latest-- TO: ' + path )
		}

		data = await getPathFromBackend( path, query.useCache );
		if ( query.filter ) data.data = dataFilter( data.data, query.filter );

		res.writeHead( data.code );
		return res.end( JSON.stringify( data.data ) )
	} catch ( e ) {
		res.writeHead( 500 );
		return res.end( JSON.stringify( { code: 500, err: 'unknown server error for path ' + path, data: {} } ) );
	}
}


async function primeSetlistCache() {
	Log( `Priming Setlist Cache` )
	setsdata = await backend.getSets();
	cache[ 'Sets' ] = JSON.stringify( setsdata )
}

function dataFilter( data, filters ) {

	// SONG FILTERS
	if ( 'songs' in data ) {
		for ( let filter of filters.split( ',' ) ) {
			let filtered
			switch ( filter ) {
				case 'pre-alternates':
					Log( 'FILTER: pre-alternates ... keeping songs before "ALTERNATES"' )
					filtered = []
					let keep_going = true
					for ( let song of data.songs ) {
						if ( song.title.match( /alternates/i ) ) {
							keep_going = false
						};
						if ( keep_going ) filtered.push( song )
					}
					data.songs = filtered;
					break;
				case 'ccli-only':
					Log( 'FILTER: ccli-only ... keeping only songs with CCLI data' )
					filtered = []
					ccli:
					for ( let song of data.songs ) {
						if ( song.ccli == '' ) continue ccli;
						filtered.push( song )
					}
					data.songs = filtered;
					break;
				case 'no-lyrics':
					Log( 'FILTER: no-lyrics ... removes the "lyrics" field' )
					filtered = []
					for ( let song of data.songs ) {
						delete song.lyrics;
						filtered.push( song )
					}
					data.songs = filtered;
					break;
				case 'no-duplicates':
					Log( 'FILTER: no-duplicates ... includes the first instance of each song' )
					filtered = []
					seen = []
					for ( let song of data.songs ) {
						if ( !seen.includes( song.title ) ) {
							filtered.push( song )
							seen.push( song.title )
						}
					}
					data.songs = filtered;
					break;
			}
		}
	}

	// SETLIST FILTERS
	if ( 'files' in data ) {
		for ( let filter of filters.split( ',' ) ) {
			let filtered = []
			let invert = false;
			if ( filter.substring( 0, 1 ) == '!' ) {
				invert = true;
				filter = filter.substring( 1 )
			}

			Log( `FILTER: will ${invert ? 'include' : 'exclude'} sets matching "${filter}"` )
			r = RegExp( filter, 'i' );
			for ( let file of data.files ) {
				let match = file.name.match( r );
				if ( match !== null && !invert ) {
					Log( 'including: ' + file.path )
					filtered.push( file )
				} else if ( match == null && invert ) {
					Log( 'including: ' + file.path )
					filtered.push( file )
				} else {
					Log( 'excluding: ' + file.path )
				}
			}
			data.files = filtered;
		}
	}
	return data;
}

// should return an object with {code, data, err}
async function getPathFromBackend( path, useCache = false ) {

	// path can be a named set, a named song, 'Songs', or 'Sets'
	Log( `Attempting to get file for ${path}` );
	if ( useCache && path in cache ) return { code: 200, data: JSON.parse( cache[ path ] ), err: null };

	let { code, data, err } = await backend.handlePath( path );
	if ( err ) {
		return { code, data, err };
	}

	if ( 'songs' in data ) {
		for ( let song of data.songs ) {
			song[ 'formatted-ccli' ] = song.ccli == '' ? '' : `CCLI #${song.ccli}`
			song[ 'formatted-copyright' ] = song.copyright == '' ? '' : `Copyright ${song.copyright}`
		}
	}

	cache[ path ] = JSON.stringify( data );
	return { code, data, err };
}


function ping() {
	// backend has been updated and we have received a ping
	Log( 'sending "myping" message' );
	io.sockets.emit( 'myping', Date.now() );
	socket_send( 'myping', Date.now() );
	maybe_refresh();
}

// native websocket functions
function ws_send( conn, msg, data ) {
	try {
		var message = { 'message': msg, 'data': data };
		message = JSON.stringify( message );
		if ( conn.readyState === WebSocket.OPEN && conn.isAlive ) conn.send( message );
	}
	catch ( e ) {
		Log( 'sending socket failed: message attempted was as follows' );
		Log( msg )
	}
}

function broadcast( message, data ) {
	wss.clients.forEach( function ( client ) {
		ws_send( client, message, data );
	} );
}

function noop() { }

function heartbeat() {
	this.isAlive = true;
}
