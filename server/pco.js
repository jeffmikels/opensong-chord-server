const axios = require( 'axios' ).default;

function chordProToOpenSong( lyrics ) {
	// fix line endings
	lyrics = lyrics.replace( /\r\n/g, '\n' );

	// remove COLUMN_BREAK and PAGE_BREAK
	lyrics = lyrics.replace( /COLUMN_BREAK|PAGE_BREAK/g, '---' );

	// now, walk the lines to do cool things
	// move inline chords to above the line
	let retval = [];
	for ( let line of lyrics.split( '\n' ) ) {
		// console.log( retval );
		// console.log( line );

		// ChordPro doesn't need leading or trailing spaces ever
		line = line.trim();

		// change [LONG CHORD LINES] to . chord lines
		let pcoLongChordSearch = /^\[([^\]]*)\]$/
		if ( line.match( pcoLongChordSearch ) ) {
			// console.log( 'longchord found' );
			retval.push( line.replace( pcoLongChordSearch, ( _, group1 ) => '.' + group1 ) );
			continue;
		}

		// change {comments} or {{comments}} to ; comments
		let pcoCommentsSearch = /\s*\{+(?:<\w+>)*([^\}]*?)(?:<\/[\w]+>)*\}+\s*/
		if ( line.match( pcoCommentsSearch ) ) {
			// console.log( 'comment line found' );
			retval.push( line.replace( pcoCommentsSearch, ( _, group1 ) => ';' + group1 ) );
			continue;
		}

		// ignore lines that match opensong format
		if ( line.startsWith( ';' ) || line.startsWith( '.' ) ) { retval.push( line ); continue; }
		if ( line.trim() == '' ) { retval.push( '' ); continue; }

		// change HEADINGS to [HEADINGS]
		if ( line.toUpperCase() == line ) {
			retval.push( `[${line}]` );
			continue;
		}

		// if we are here, we are in a normal line that might contain chords
		let offsetCorrection = 0;

		// procedure is to split the lyric line by chords
		// and then reassemble so that line lengths match
		// there will always be an odd number of lineparts
		// either: before the match, the full matched text, after the match
		// or:     the original text
		const chordSearch = /\[([ABCDEFG][#b♭]?[^\s]*?)\]/g
		let lineparts = line.split( chordSearch );
		let chordLine = '';
		let lyricLine = lineparts.shift();
		while ( lineparts.length > 1 ) {
			let chordPart = lineparts.shift();
			chordLine += ' '.repeat( lyricLine.length - chordLine.length ) + chordPart;
			lyricLine += lineparts.shift();
		}
		if ( chordLine != '' ) retval.push( '.' + chordLine );
		retval.push( ' ' + lyricLine );
	}
	return retval.join( '\n' );

}

class PlanningCenter {
	apiVersions = {
		services: '2018-11-01',
	}

	// config object must look like this
	// {
	// 	apikey: '',
	// 	secret: '',
	// }
	constructor ( { apikey, secret } ) {
		this.apikey = apikey;
		this.secret = secret;
		this.auth = {
			username: apikey,
			password: secret,
		}
	}

	// call with a config object
	async call( { url, method = 'get', params = null, data = null, apiVersion = '' } ) {
		url = 'https://api.planningcenteronline.com' + url;
		let headers = {};
		if ( apiVersion != '' ) headers[ 'X-PCO-API-Version' ] = apiVersion;

		let res = await axios( {
			method,
			url,
			params,
			data,
			headers,
			auth: this.auth,
		} );
		return res;
	}

	// will return a callback to get the next page of data
	async get( { url, params = null, apiVersion, getAll = false } ) {
		if ( getAll ) return this.getAll( { url, params, apiVersion } );
		console.log( url );

		if ( params == null ) params = {};
		let data = [];
		let included = [];
		let more = null;
		let res = await this.call( { url, params, apiVersion } );
		if ( res.status == 200 ) {
			if ( Array.isArray( res.data.data ) )
				data.push( ...res.data.data );
			else
				data.push( res.data.data )

			included.push( ...res.data.included );

			if ( data.meta?.next ) {
				let newparams = { ...params }
				newparams.offset = data.meta.next.offset
				more = async () => {
					return await this.get( { url, params: newparams, apiVersion } );
				}
			}
		}

		return { data, included, more };
	}

	// will automatically get all available data
	async getAll( { url, params = null, apiVersion } ) {
		if ( params == null ) params = {};
		params.per_page = 100;
		let data = [];
		let included = [];
		let res = await this.get( { url, params, apiVersion } );
		data.push( ...res.data )
		included.push( ...res.included )
		while ( res.more != null ) {
			res = await res.more();
			data.push( ...res.data )
			included.push( ...res.included )
		}
		return { data, included };
	}

	// these functions wrap the api
	async getSongs( { id = null, getAll = false } ) {
		let url = '/services/v2/songs'
		if ( id != null ) url += '/' + id;
		return await this.get( { url, apiVersion: this.apiVersions.services, getAll } );
	}

	async getSongArrangements( { songId, arrangementId = null, getAll = false } ) {
		let url = `/services/v2/songs/${songId}/arrangements`
		if ( arrangementId != null ) url += '/' + arrangementId;
		return await this.get( { url, apiVersion: this.apiVersions.services, getAll } );
	}

	async getServiceTypes( { id = null, getAll = false } ) {
		let url = '/services/v2/service_types'
		if ( id != null ) url += '/' + id;
		return await this.get( { url, apiVersion: this.apiVersions.services, getAll } );
	}

	async getPlans( { serviceTypeId, planId = null, getAll = false } ) {
		let url = `/services/v2/service_types/${serviceTypeId}/plans`
		if ( planId != null ) url += '/' + planId;
		return await this.get( { url, apiVersion: this.apiVersions.services, getAll } );
	}


	// these functions wrap multiple things
	async findPlans( { includeItems = true, reloadServiceTypes = false } ) {
		if ( reloadServiceTypes || this.serviceTypes == null ) {
			let { data } = await this.getServiceTypes( { getAll: true } );
			this.serviceTypes = data;
		}
		let retval = [];
		for ( let st of this.serviceTypes ) {
			let { data } = await this.getPlans( { serviceTypeId: st.id } );
			for ( let plan of data ) {
				if ( includeItems )
					await this.populatePlanItems( plan );
				retval.push( plan );
			}
		}
		return retval;
	}

	async populatePlanItems( plan ) {
		let serviceTypeId = plan.relationships.service_type.data.id;
		plan.items = await this.getPlanItems( serviceTypeId, plan.id );
	}

	// get plan items along with song and arrangement data
	// by using the 'include' feature of the api
	// however, the api returns the included items in a separate array
	// and we want to populate the relationships directly
	// item.relationships.song.data.relationships.arrangement.attributes
	async getPlanItems( serviceTypeId, planId, filterType = 'song' ) {
		let url = `/services/v2/service_types/${serviceTypeId}/plans/${planId}/items`
		let params = { include: 'song,arrangement', per_page: 100 }
		let { data, included } = await this.get( { url, params, apiVersion: this.apiVersions.services } );

		// now walk through items to associate plan items with related data since pco doesn't do it for us
		let arrangements = {};
		let songs = {};
		for ( let item of included ) {
			if ( item.type == 'Song' ) songs[ item.id ] = item;
			else if ( item.type == 'Arrangement' ) arrangements[ item.id ] = item;
		}

		// associate arrangements with songs
		for ( let key of Object.keys( arrangements ) ) {
			let arrangement = arrangements[ key ];
			let songid = arrangement.relationships.song.data.id
			if ( songs[ songid ] ) songs[ songid ].arrangement = arrangement;
		}

		// create finished plan details array
		let retval = [];
		for ( let item of data ) {
			if ( item.attributes.item_type == 'song' ) {
				let songid = item.relationships.song.data.id;
				let arrid = item.relationships.arrangement.data.id;
				item.relationships.song.data = songs[ songid ];
				item.relationships.arrangement.data = arrangements[ arrid ];
			}
			if ( filterType == '' || item.attributes.item_type == filterType ) {
				retval.push( item );
			}
		}
		return retval;
	}


	//// THESE ARE THE FUNCTIONS THAT MIMIC THE OPENSONG MODULE
	songFromSongDataWithArrangement( songdata ) {
		let song = {};
		song.path = `Songs/${songdata.id}`
		song.ccli = songdata.attributes.ccli_number;
		song.title = songdata.attributes.title;
		song.author = songdata.attributes.author;
		song.copyright = songdata.attributes.copyright;
		song.bpm = songdata.arrangement.attributes.bpm;
		song.chordpro_lyrics = songdata.arrangement.attributes.chord_chart;
		song.key = songdata.arrangement.attributes.chord_chart_key;
		song.lyrics = chordProToOpenSong( songdata.arrangement.attributes.chord_chart ?? '' )
		return song;
	}

	makePlanTitle( plan ) {
		let title_items = [];
		if ( plan.attributes.series_title != null ) title_items.push( plan.attributes.series_title );
		if ( plan.attributes.title != null ) title_items.push( plan.attributes.title );
		if ( title_items.length == 0 ) title_items.push( plan.id );
		return title_items.join( ': ' );
	}

	makePlanPath( plan ) {
		let serviceTypeId = plan.relationships.service_type.data.id
		return `Sets/${serviceTypeId}/${plan.id}`
	}

	async setFromPlan( plan ) {
		if ( !plan.items ) await this.populatePlanItems( plan );

		let items = plan.items;
		let title = this.makePlanTitle( plan )

		// console.log( `PROCESSING PLAN: ${title} with ${items.length} items` );
		let path = this.makePlanPath( plan );
		let name = title;

		// songs should return the same data as the opensong module
		// title, author, ccli, copyright, bpm, key, lyrics, path
		let songs = [];
		for ( let item of items ) {
			let song = {};
			if ( item.attributes.item_type == 'song' ) {
				song = this.songFromSongDataWithArrangement( item.relationships.song.data );
			} else {
				song.title = item.attributes.title;
				song.copyright = item.attributes.description;
			}
			songs.push( song );
		}
		return { path, name, songs }
	}

	// should return an object that matches what opensong returns
	// root, dirs[], files[]
	// where each "file" is an object with {path, name, time}
	async getSets() {
		let root = '/Sets'
		let dirs = [];
		let files = [];
		let plans = await this.findPlans( {} );
		for ( let plan of plans ) {
			if ( plan.attributes.items_count == 0 ) continue;

			let dirpath = `Sets/${plan.relationships.service_type.data.id}`
			let filepath = `${dirpath}/${plan.id}`
			dirs.push( dirpath );
			files.push( {
				path: filepath,
				name: this.makePlanTitle( plan ),
				time: Date.parse( plan.attributes.sort_date )
			} );
		}
		return { root, dirs, files };
	}

	// should return an object that matches what opensong returns
	// title, author, ccli, copyright, bpm, key, lyrics, path
	async getSongsForFrontend( songId = null ) {
		let songs = [];
		let args = { getAll: true }
		if ( songId != null ) args = { id: songId, getAll: false };
		let { data, more } = await this.getSongs( args );
		for ( let songdata of data ) {
			songdata.arrangement = {}

			let res = await this.getSongArrangements( { songId: songdata.id } );
			if ( res.data.length > 0 ) {
				songdata.arrangement = res.data[ 0 ];
				let song = this.songFromSongDataWithArrangement( songdata );
				songs.push( song );
			}
		}
		return songs;
	}

	async loadSet( { serviceTypeId, planId } ) {
		let { data } = await this.getPlans( { serviceTypeId, planId } );
		let plan = data[ 0 ];
		return await this.setFromPlan( plan ); // will populate items if needed
	}

	async loadSong( songId ) {
		let [ song ] = await this.getSongsForFrontend( songId );
		return song;
	}

	// path must refer to files relative to the config.path
	// path can be any of the following formats
	// Songs, Songs/SongId, Sets, Sets/ServiceTypeId/PlanId
	async handlePath( path ) {
		console.log( `Grabbing PlanningCenter resource from ${path}...` )

		try {
			let data;
			if ( path.match( /^Sets\/?$/ ) ) {
				data = await this.getSets();
			} else if ( path.match( /^Sets\/.+\/.+$/ ) ) {
				let [ _, serviceTypeId, planId ] = path.split( '/' );
				data = await this.loadSet( { serviceTypeId, planId } );
			} else if ( path.match( /^Songs\/?$/ ) ) {
				data = await this.getSongsForFrontend();
			} else if ( path.match( /^Songs\/.+$/ ) ) {
				let [ _, songId ] = path.split( '/' );
				data = await this.loadSong( songId );
			} else {
				return { code: 500, data, err: `could not parse path: ${path}` }
			}
			return { code: 200, data, err: {} }
		} catch ( err ) {
			console.log( err );
			console.log( `error opening file: ${path}` );
			return { code: 404, data: {}, err };
		}
	}

}

module.exports = {
	PlanningCenter
}
