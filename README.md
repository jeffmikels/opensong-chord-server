# opensong-chord-server

This applicaton will take the data files from an OpenSong data directory and serve them to http clients.

It includes a basic interface to be used for displaying chords and lyrics to musicians on a tablet, phone, or computer.

It can access OpenSong files from the local filesystem or over WebDAV connection.

## Planning Center Online Support (beta)

Support is currently being added for serving songs and chord charts from Planning Center Services. Planning Center support is currently considered beta. You will need an app id and secret from the Planning Center developer portal to use this with Planning Center.

## installation

```
$ git clone https://github.com/jeffmikels/opensong-chord-server.git
$ cd opensong-chord-server
$ npm install
$ cp conf.example.js conf.js
```

Edit the variables in `conf.js`

## during development

```
$ node watcher.js
```

## for production

```
$ node app.js
```

A sample `worshipchords.service` file is included for systemd.

## nginx configuration

```
location /[SERVER_SUBDIRECTORY] {
	return 302 https://[SERVER_NAME]/[SERVER_SUBDIRECTORY]/;
}
location /worshipchords/ {
	proxy_pass http://127.0.0.1:8083;
	proxy_set_header X-Real-IP $remote_addr;
	proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
	proxy_set_header Host $host;
	proxy_redirect default;
}
```

## API DOCUMENTATION

```
/ or /index.html => serve index.html
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
```
