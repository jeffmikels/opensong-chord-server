const config = require( './conf' );

async function testOpenSong() {
	var { OpenSong } = require( './opensong' );
	console.log( config.opensong );
	var os = new OpenSong( config.opensong );
	// var songs = await os.getSongs();
	// console.log( songs );
	// var sets = await os.getSets();
	// console.log( sets );
	var set = await os.loadSet( '2021-09-26' );
	console.log( set );
}

async function testPco() {
	var { PlanningCenter } = require( './pco' );
	let pco = new PlanningCenter( config.pco );
	// console.log( await pco.getSongs() );
	// let data = await pco.getPlans();
	// let data = await pco.getSetsForFrontend();
	// let data = await pco.getPlanItems( 1169425, 54836555 )
	// let data = await pco.handlePath( 'Sets/1169425/54817185' );
	let data = await pco.handlePath( 'Songs/21124246' );
	console.dir( data, { depth: 10 } );
}

async function main() {
	// await testOpenSong();
	await testPco();
}

main();
