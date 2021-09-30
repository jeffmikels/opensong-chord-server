// non-exported functions
// ============================
function getTagContent( xml, tag ) {
	let re = new RegExp( '<' + tag + '>(.*?)<\/' + tag + '>', 's' ) //dotAll
	let res = xml.match( re );
	if ( res )
		return res[ 1 ]
	return '';
}

// return possible keys for each chord
function keySemitonesFromChord( chord_semi, color ) {
	if ( color == 'minor' ) {
		// minor chords might be the third, second, or sixth of the scale
		return [
			( chord_semi + 3 ) % 12,
			( chord_semi + 12 - 2 ) % 12,
			( chord_semi + 12 - 4 ) % 12,
		];
	} else if ( color == 'maj7' ) {
		// major7 chords are usually the 6m with a 4 added
		// so they usually function as the fourth of the scale
		// but they are also in the scale of the 6m
		// since we don't report minor keys, for now, we just guess the 4
		return [
			( chord_semi + 12 - 5 ) % 12,
		];
	} else {
		// major chords are usually the 1, 4, 5 of the scale
		return [
			chord_semi % 12,
			( chord_semi + 12 - 5 ) % 12,
			( chord_semi + 12 - 7 ) % 12,
		];
	}
}

function guessKeyForSong( song ) {
	console.log( `Computing Key for ${song.title}` )
	let possible = [];
	let seen = [];
	// to compute the key:
	// for the first chord, compute the possible keys
	// for each subsequent chord, remove impossible keys until one remains
	// once a key is computed... exit the loop

	// label for interior breakpoints
	keySearch:
	for ( let line of song.lyrics.split( '\n' ) ) {
		if ( line.substring( 0, 1 ) == '.' ) {
			// Log(line);
			// let cs = /[^\/\.](([ABCDEFG][b#]?)(m(?!a))?[^\s\/]*)/g;
			// ignore bass chords (immediately following a slash)
			let cs = /[^\/](([ABCDEFG][b#]?)(maj7|Maj7|M7|m)?[^\s\/]*)/g;
			let m;
			while ( 1 ) {
				m = cs.exec( line );
				if ( m ) {
					let cname = m[ 1 ];
					if ( seen.indexOf( cname ) >= 0 ) continue;
					seen.push( cname );
					let cletter = m[ 2 ];
					let color = m[ 3 ];
					color = color ? color : 'major';
					if ( color == 'Maj7' || color == 'M7' ) color = 'maj7';
					if ( color == 'm' ) color = 'minor';

					console.log( `Found Chord: ${cname} => ${cletter} (${color})` )
					let cindex = chordletters.indexOf( cletter )
					if ( cindex >= 0 ) {
						// is this the first chord we have seen?
						if ( possible.length == 0 ) {
							possible = keySemitonesFromChord( cindex, color );
							let pos_string = possible.map( ( e ) => chordletters[ e ] );
							console.log( `${cname} => ${pos_string}` );
							continue;
						} else {
							new_possible = keySemitonesFromChord( cindex, color );
							possible = possible.filter( ( e ) => new_possible.indexOf( e ) != -1 );
							let pos_string = possible.map( ( e ) => chordletters[ e ] );
							console.log( `${cname} => ${pos_string}` );
							if ( possible.length == 1 ) {
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

	if ( possible.length > 0 ) {
		// only use flat key signatures except for F#
		let real_key_index = possible[ 0 ] + 12;
		if ( real_key_index == 9 + 12 ) real_key_index = 9; // CHANGE Gb to F#
		song.key = chordletters[ real_key_index ];
		let verb = '';
		if ( possible.length == 1 ) {
			console.log( `Determined Key Is: ${song.key}` );
			verb = 'AUTO-COMPUTED';
		}
		else {
			console.log( `Guessed Key Is: ${song.key}` );
			verb = 'GUESSED';
		}
		song.lyrics = `;SAVED KEY: ${song.key} (${verb})\n` + song.lyrics;
	}
	else {
		console.log( 'Key could not be determined.' )
	}
}

class Client {
	// will be overridden
	async exists( path = '' ) { }
	async stat( path = '' ) { }
	async walk( path, onDir, onFile ) { }
	async readFile( path = '' ) { }
}

class DavClient extends Client {
	constructor ( url, path, username, password ) {
		super();
		const webdav = require( "webdav" );

		let joiner = '';
		if ( !url.endsWith( '/' ) && !path.startsWith( '/' ) ) joiner = '/';
		let fullurl = url + joiner + path;

		console.log( `Connecting to OpenSong DAV server: ${fullurl}` )
		this.davClient = webdav.createClient(
			fullurl, { username, password }
		);
	}

	async exists( path ) {
		return await this.davClient.exists( path );
	}

	async stat( path ) {
		let stat = await this.davClient.stat( path );
		stat.time = new Date( stat.lastmod )
		stat.isDirectory = stat.type == 'directory';
		stat.isFile = stat.type == 'file';
		return stat;
	}

	// onDir and onFile are optional callbacks
	async walk( path, onDir = null, onFile = null ) {
		console.log( `WALKING DIRECTORY: ${path}` );
		let retval = { root: path, dirs: [], files: [] };
		try {

			// returns Array<Stat>
			let items = await this.davClient.getDirectoryContents( path );

			// the first item is the stat of the directory itself
			items.shift()
			for ( let item of items ) {

				// ignore files beginning with a dot
				if ( item.basename.match( /^\./ ) ) continue;

				// add a time field to the item
				item.time = new Date( item.lastmod )
				console.log( 'FOUND ITEM: ' + item.basename );

				let p = path + '/' + item.basename;
				let itemData = {
					path: p,
					name: item.basename,
					time: item.time,
					rawItem: item,
				}

				if ( item.type == 'directory' ) {
					if ( onDir != null ) onDir( itemData );
					let data = await this.walk( p, onDir, onFile );
					retval.dirs.push( data );
				}
				else {
					if ( onFile != null ) onFile( itemData );
					retval.files.push( itemData )
				}
			}
		} catch ( e ) {
			console.log( e )
		}

		// sort files by time before returning
		retval.files.sort( ( a, b ) => {
			return ( a.time < b.time ) ? 1 : -1
		} );
		return retval;
	}

	async readFile( path ) {
		// returns a buffer not a string
		let res = await this.davClient.getFileContents( path );
		return res.toString();
	}
}

class FSClient extends Client {
	constructor ( basepath = '' ) {
		super();
		// ensure basepath ends with a slash if it is specified
		if ( basepath.length >= 1 && !basepath.endsWith( '/' ) ) basepath += '/';

		this.basepath = basepath;
		this.fs = require( 'fs' ).promises;
	}

	// use the real path for all fs functions
	realPath( path ) { return path.startsWith( this.basepath ) ? path : this.basepath + path }

	// use the relative paths for all class functions
	async exists( path ) {
		try {
			await this.stat( path );
			return true;
		} catch ( e ) {
			return false;
		}
	}

	async stat( path ) {
		let realPath = this.realPath( path );
		let stat = await this.fs.stat( realPath );

		// make aliases that work the same as the dav client
		stat.time = stat.mtime;
		stat.isDirectory = stat.isDirectory();
		stat.isFile = stat.isFile();
		stat.filename = path;
		stat.fullPath = realPath;
		return stat;
	}

	// onDir and onFile are optional callbacks
	async walk( path, onDir = null, onFile = null ) {
		let realPath = this.realPath( path );
		console.log( `WALKING DIRECTORY: ${realPath}` );

		let retval = { root: path, dirs: [], files: [] };
		try {
			// yields a list of fs.Dirent objects
			// with name, isFile() and isDirectory() fields
			// . and .. are ignored
			let items = await this.fs.readdir( realPath, { withFileTypes: true } );
			for ( let item of items ) {
				if ( item.name.startsWith( '.' ) ) continue;
				console.log( item );
				item.basename = item.name;
				item.filename = `${path}/${item.name}`

				// just to get the time
				let stats = await this.stat( item.filename );

				// add a time field to the item
				item.time = stats.time;

				let p = item.filename;
				let itemData = {
					path: p,
					name: item.basename,
					time: item.time,
					rawItem: item,
				}

				if ( item.isDirectory() ) {
					if ( onDir != null ) onDir( itemData );
					let data = await this.walk( p, onDir, onFile );
					retval.dirs.push( data );
				}
				else {
					if ( onFile != null ) onFile( itemData );
					retval.files.push( itemData )
				}
			}
		} catch ( e ) {
			console.log( e )
		}

		// sort files by time before returning
		retval.files.sort( ( a, b ) => {
			return ( a.time < b.time ) ? 1 : -1
		} );
		return retval;
	}

	async readFile( path ) {
		let realPath = this.realPath( path );
		console.log( `Reading file from ${realPath}` );
		return await this.fs.readFile( realPath, { encoding: 'utf-8' } );
	}
}


class OpenSong {

	/// config should look like this
	// {
	// 	@required method: 'fs' or 'dav',
	// 	@if fs    path: '/path/to/OpenSong/',
	// 	@if dav   dav_url: "[webdav url]",
	// 	@if dav   dav_username: "webdavuser",
	// 	@if dav   dav_password: "webdavpassword",
	// }
	constructor ( { method, path, dav_url, dav_username, dav_password } ) {
		if ( method == 'dav' ) {
			this.client = new DavClient( dav_url, path, dav_username, dav_password )
		} else {
			this.client = new FSClient( path );
		}
	}

	async getSets() {
		// { root: path, dirs: [], files: [] };
		let { files } = await this.client.walk( 'Sets' );
		return files;
	}

	async getSongs() {
		let retval = [];
		await this.client.walk( 'Songs', null, ( itemData ) => retval.push( itemData ) );
		return retval;
	}

	// path must be relative to the config.path
	async loadSong( path ) {
		if ( !path.startsWith( 'Songs/' ) ) path = 'Songs/' + path;
		let xmldata = await this.client.readFile( path );
		let song = this.parseSongXML( xmldata );
		if ( song != null ) song.path = path;
		return song;
	}

	// path must be relative to the config.path
	async loadSet( path ) {
		if ( !path.startsWith( 'Sets/' ) ) path = 'Sets/' + path;
		console.log( `Loading set at path: ${path}` );
		let xmldata = await this.client.readFile( path );
		let setData = await this.parseSetXML( xmldata );
		setData.path = path;
		return setData;
	}

	// path must refer to files relative to the config.path
	// path can be any of the following formats
	// Songs, Songs/FolderName, Songs/FolderName/SongName, Sets, Sets/SetName
	async handlePath( path ) {
		console.log( `Grabbing OpenSong file from ${path}...` )

		try {
			let data;
			if ( path.match( /^Sets\/?$/ ) ) {
				data = await this.getSets();
			} else if ( path.match( /^Sets\/.+$/ ) ) {
				data = await this.loadSet( path );
			} else if ( path.match( /^Songs\/?$/ ) ) {
				data = await this.getSongs();
			} else {
				data = await this.loadSong( path );
			}
			return { code: 200, data, err: {} }
		} catch ( err ) {
			console.log( err );
			console.log( `error opening file: ${path}` );
			return { code: 404, data: {}, err };
		}
	}

	async parseSetXML( xmldata ) {
		try {
			console.log( xmldata );
			let setData = { songs: [] };

			// get set name
			let t = xmldata.match( /<set name="(.*?)".*?>/ )
			setData.name = t[ 1 ];

			// get set songs
			let matches = xmldata.match( /<slide_group .*?\/>/g )
			for ( let slide_group of matches ) {
				let name = '';
				let presentation = '';
				let type = '';
				let path = '';
				let t = slide_group.match( /name="(.*?)"/ );
				if ( t ) name = t[ 1 ];

				t = slide_group.match( /presentation="(.*?)"/ );
				if ( t ) presentation = t[ 1 ];

				t = slide_group.match( /type="(.*?)"/ );
				if ( t ) type = t[ 1 ];
				if ( type != 'song' ) continue;

				t = slide_group.match( /path="(.*?)"/ );
				if ( t ) {
					path = 'Songs/' + t[ 1 ] + '/' + name;
					path = path.replace( /\/\//, '/' ) // replace double slashes
					console.log( path );


					let newsong = await this.loadSong( path );

					if ( newsong == null ) {
						newsong = {
							path: path,
							title: name,
							lyrics: `;FILE NOT FOUND ON SERVER:\n;"${path}"`,
						}
					}
					if ( presentation != '' ) newsong.presentation = presentation;
					setData.songs.push( newsong )
				}
			}
			return setData;
		} catch ( e ) {
			console.log( e );
			console.log( 'error parsing set' );
		}
	}

	parseSongXML( xmldata ) {
		let chordletters = 'A A# B C C# D D# E F F# G G# A Bb B C Db D Eb E F Gb G Ab'.split( ' ' );
		let real_key_map = [ 12, 13, 14, 15, 16, 17, 18, 19, 20, 9, 22, 23 ];
		chordletters.concat( chordletters )
		let song = {}
		try {
			xmldata = xmldata.replace( /\r\n/g, '\n' ).replace( /\r/g, '\n' );
			song.title = getTagContent( xmldata, 'title' );
			song.author = getTagContent( xmldata, 'author' );
			song.ccli = getTagContent( xmldata, 'ccli' );
			song.copyright = getTagContent( xmldata, 'copyright' );
			song.presentation = getTagContent( xmldata, 'presentation' );
			song.tempo = getTagContent( xmldata, 'tempo' );
			song.lyrics = getTagContent( xmldata, 'lyrics' );

			// ignore keys specified in the file, after transposing, they will be out of date
			// song.key = getTagContent(xmldata,'key');

			// also ignore the capo data
			// song.transpose = getTagContent(xmldata,'capo');

			// sometimes, we use extra newlines for the printed
			// version of the lyrics, but we don't need them for display
			song.lyrics = song.lyrics.replace( /\n(\s*\n)+/g, '\n\n' )

			song.abc = '';

			// set up ABC notation regex
			// abc is assumed to take up the entire end of the document
			let abc = /%abc(.*)/gsi;
			let abcmatch = abc.exec( song.lyrics );
			if ( abcmatch ) {
				// clean up initial characters that might be added by opensong
				song.abc = abcmatch[ 1 ].replace( /(\n|^)[;\s.]/g, '$1' );
				song.lyrics = song.lyrics.replace( abcmatch[ 0 ], '' );
			}


			// if song has no bpm specified in the file, compute it now
			if ( !song.bpm ) {
				console.log( `Computing BPM for ${song.title}` );
				// Log(song.lyrics)
				let re = new RegExp( /;\s*(\d+)\s*BPM|;\s*BPM\s*:?\s*(\d+)/gmi )
				let match = re.exec( song.lyrics );
				if ( match ) {
					// Log(match);
					if ( match[ 1 ] ) song.bpm = parseInt( match[ 1 ] );
					else if ( match[ 2 ] ) song.bpm = parseInt( match[ 2 ] );
					console.log( `BPM: ${song.bpm}` );
				} else {
					console.log( 'No bpm information found' );
					song.lyrics = ';BPM UNKNOWN\n' + song.lyrics;
				}
			}

			// look for a key override tag combination in the song
			let r = /\[(?:k|key)\][\n\r]+\.\s*(\S+)\s*/i
			let m = r.exec( song.lyrics )
			if ( m ) {
				let cletter = m[ 1 ];
				song.key = cletter;
				console.log( `Key Override Tag Detected. Root is ${song.key}.` )
				song.lyrics = song.lyrics.replace( r, '' );
			}

			// if we still don't have a key, compute it now
			if ( !song.key ) {
				guessKeyForSong( song );
			}
			return song;
		} catch ( e ) {
			// Log(e);
			console.log( `error parsing file: ${fullPath}` );
			return null;
		}
	}
}

module.exports = {
	OpenSong
}
