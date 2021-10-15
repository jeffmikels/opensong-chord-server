<template>
  <div>
  <div id="songs" :class="{ nocolumns: !columns, columns: columns }">
    <div class="song" v-for="song in current_songs" :key="song.title">
      <h3 class="title">{{ song.title | cleantitle }}</h3>
      <div v-if="showchords">
        <div
          id="alert"
          v-if="
            show_alert && (song.capo || nashville) && current_song_index != null
          "
        >
          <span v-if="song.key"
            >&nbsp;[ KEY: {{ song | transposed_key }} ]&nbsp;</span
          >
          <span v-if="song.capo > 0"
            >&nbsp;[ CAPO: {{ song.capo }} ]&nbsp;</span
          >
          <!-- <span v-if="song.bpm">&nbsp;[ BPM: {{song.bpm}} ]&nbsp;</span> -->
        </div>

        <div class="songmeta">
          <span v-if="song.key"
            >[ KEY: {{ song | transposed_key }}
            <small v-if="song.transpose > 0"
              >({{ song.transpose | nice_transpose }}) </small
            >]</span
          >
          <span v-if="song.capo"
            >[ CAPO: {{ song | capo_key }}
            <small v-if="song.capo > 0">({{ song.capo }}) </small>]</span
          >
          <span v-if="song.bpm">[ BPM: {{ song.bpm }} ]</span>
          <!-- <span v-if="song.transpose > 0"></span> -->
        </div>
        <div v-if="song.key" class="chordbuttons">
          <button
            class="metronomebutton"
            :class="{ active: metronome_playing }"
            @click="toggle_metronome(song)"
          >
            M
          </button>
          <button class="bpmbutton" @click="bpm(song, -1)">&#8722;</button>
          <button class="bpmbutton" @click="bpm(song, 1)">＋</button>
        </div>
      </div>
      <div
        class="lyrics"
        :class="{ nochords: !showchords, nocomments: !showcomments }"
        v-html="lyric_html(song)"
      ></div>
      <div
        class="abc"
        v-html="abc_svg(song)"
        v-if="song.abc && showchords"
      ></div>
      <div class="legal">
        <div class="author">{{ song.author }}</div>
        <div class="copyright">{{ song.copyright }}</div>
        <div class="ccli" v-if="song.ccli">#{{ song.ccli }}</div>
      </div>
    </div>
    <div id="nav-buttons">
      <button class="prev" @click="prev">←</button>
      <button class="next" @click="next">→</button>
    </div>
  </div>
  <v-bottom-sheet hide-overlay v-model="show_function_sheet">
    <v-sheet
      class="text-center"
      height="200px"
    >
      <v-container>
        <v-row>
          <v-col>
            <div class="text-h6">
              Key
              <v-chip label small color="cyan" class="ma-2">{{ current_song | transposed_key }}
              <small v-if="current_song.transpose > 0" style="padding-left: 4px;">({{ current_song.transpose | nice_transpose }}) </small>
            </v-chip>
            </div>
            <v-btn @click="transpose(current_song, 1)" elevation="2" class="ma-2" color="cyan">
              Key <v-icon right>mdi-arrow-up-bold</v-icon>
            </v-btn>
            <br />
            <v-btn @click="transpose(current_song, -1)" elevation="2" class="ma-2" color="cyan">
              Key <v-icon right>mdi-arrow-down-bold</v-icon>
            </v-btn>
          </v-col>
          <v-col>
            <div class="text-h6">Capo
              <v-chip label small color="pink" class="ma-2" v-if="current_song.capo > 0">
              {{ current_song | capo_key }}
              ({{ current_song.capo }})
            </v-chip>
            </div>
            <v-btn @click="capo(current_song, 1)" elevation="2" class="ma-2" color="pink">
              Capo <v-icon right>mdi-arrow-up-bold</v-icon>
            </v-btn>
            <br />
            <v-btn @click="capo(current_song, -1)" elevation="2" class="ma-2" color="pink">
              Capo <v-icon right>mdi-arrow-down-bold</v-icon>
            </v-btn>
          </v-col>
          <v-col>
            <v-btn @click="nashville = !nashville" elevation="2" color="orange" :outlined="!nashville" block>
              <v-icon left>mdi-pound-box</v-icon> Nashville
            </v-btn>
            <br>
            <v-btn @click="showchords = !showchords" elevation="2" color="orange" :outlined="!showchords" block>
              <v-icon left>mdi-music-note</v-icon> Chords
            </v-btn>
            <br>
            <v-btn @click="showcomments = !showcomments" elevation="2" color="orange" :outlined="!showcomments" block>
              <v-icon left>mdi-information</v-icon> Comments
            </v-btn>
          </v-col>
        </v-row>
      </v-container>
    </v-sheet>
  </v-bottom-sheet>
  </div>
</template>

<script lang="ts">
import Vue from "vue";

const chordletters = "A A# B C C# D D# E F F# G G# A Bb B C Db D Eb E F Gb G Ab".split(
  " "
);
// const scale_colors = ["", "m", "m", "", "", "m", "dim"];
const semitones_to_nashville = {
  0: 1,
  2: 2,
  4: 3,
  5: 4,
  7: 5,
  9: 6,
  11: 7
};

export default Vue.extend({
  name: "Song",
  props: ["songs"],
  data() {
    return {
      show_alert: false,
      showall: false,
      showchords: true,
      showcomments: true,
      columns: 0,
      nashville: false,
      metronome_playing: false,
      current_song_index: 1,
      show_function_sheet: false
    };
  },
  filters: {
    cleantitle: function(s) {
      return s.replace(/\s*=+\s*/g, "");
    },
    transposed_key: function(song) {
      const note_index = chordletters.indexOf(song.key);
      if (note_index === -1) return song.key;
      let target_key_index = (note_index + song.transpose) % 12;
      if (target_key_index !== 9) target_key_index += 12;
      return chordletters[target_key_index];
    },
    capo_key: function(song) {
      const note_index = chordletters.indexOf(song.key);
      if (note_index === -1) return song.key;
      let target_key_index =
        (note_index + song.transpose + 36 - song.capo) % 12;
      if (target_key_index !== 9) target_key_index += 12;
      return chordletters[target_key_index];
    },
    niceTime: function(i) {
      const d = new Date(i);
      return `${d.toDateString()}`;
    },
    nice_transpose: function(num) {
      if (num <= 6) return `+${num}`;
      else return `-${12 - num}`;
    },
  },
  computed: {
    current_song: function() {
      if (this.songs === false || this.songs === null) {
        return {};
      }
      if (this.current_song_index === null || this.showall) {
        return {};
      } else return this.songs[this.current_song_index];
    },
    current_songs: function() {
      if (this.songs === false || this.songs === null) {
        return [];
      }
      if (this.current_song_index === null || this.showall) {
        return this.songs;
      } else return [this.songs[this.current_song_index]];
    }
  },
  methods: {
    lyric_html(song) {
      let html = "";
      const transpose = song.transpose ? song.transpose : 0;
      const capo = song.capo ? song.capo : 0;
      let lines = song.lyrics.split("\n");

      // set up chord search regex
      const cs = /(([ABCDEFG][b#]?)(m(?!a))?[^\s/]*)(\/?)/g; // chords need whitespace or slash at end

      if (transpose > 0 || capo > 0 || this.nashville) {
        const realtranspose = transpose - capo + 36; // capo can be anywhere on the neck and might make transpose negative

        let key_index = chordletters.indexOf(song.key);
        if (key_index === -1) key_index = 0;

        let target_key_index = (key_index + realtranspose) % 12;
        if (target_key_index !== 9) target_key_index += 12;
        const target_key = chordletters[target_key_index];
        const targetflats = target_key.search(/^F$|^.b$/) !== -1;

        // replace all source chords with target chords
        let m;
        const transposed: string[] = [];
        for (const line of lines) {
          let transposed_line = "";
          if (line.search(/^\./) === -1) {
            transposed_line = line;
          } else {
            let cursor = 0;
            cs.lastIndex = 0;
            let next_chord_is_bass = false;
            while (1) {
              m = cs.exec(line);
              if (!m) {
                transposed_line += line.substring(cursor);
                break;
              }

              const match = m[0];
              const cname = m[1]; // the full chord Ebmaj7
              const source_chord = m[2]; // just the rank, Ab, etc.
              const chord_index = chordletters.indexOf(source_chord);
              const has_bass = m[4] === "/";

              let target_chord;
              if (this.nashville) {
                const semitones = (chord_index + 24 - key_index) % 12;
                target_chord = semitones_to_nashville[semitones] + "-";
              } else {
                let target_index = (chord_index + realtranspose) % 12;
                if (targetflats) target_index += 12;
                target_chord = chordletters[target_index];
              }

              const full_chord = cname.replace(source_chord, target_chord);

              // get everything from the last cursor to before this chord
              const chord_position = cs.lastIndex - match.length;
              transposed_line += line.substring(cursor, chord_position);

              // is this line as long as it should be?
              const correct_length = cs.lastIndex - match.length;
              while (
                !next_chord_is_bass && // eslint-disable-line no-unmodified-loop-condition
                transposed_line.length < correct_length
              ) {
                transposed_line += " ";
              }

              // replace the chord itself
              transposed_line += full_chord;
              if (has_bass) transposed_line += "/";
              next_chord_is_bass = has_bass;

              cursor = cs.lastIndex;
              // if (full_chord.length > cname.length) cursor += full_chord.length - cname.length;
            }
          }
          // clean trailing '-' from nashville chords
          if (this.nashville) {
            transposed_line = transposed_line.replace(/-([^\d])|-$/g, "$1");
          }
          transposed.push(transposed_line);
        }
        lines = transposed;
      }

      // process all lyric lines
      let chordline = "";
      let usedchords = true;
      let i = 0;
      while (i < lines.length) {
        let line = lines[i];
        const char = line.substring(0, 1);
        line = line.substring(1);

        let classname = "";
        switch (char) {
          case ".":
            // did we already have a chord line in the buffer
            // if so, dump that one first
            if (!usedchords && chordline !== "") {
              html += `<div class="chord">${chordline}</div>`;
            }
            classname = "chord";
            chordline = line;
            if (chordline === "") chordline = " ";
            usedchords = false;
            break;
          case " ":
            // only flag a line as a lyric line if it
            // actually has lyric content
            if (!line.match(/^\s*$/)) classname = "lyric";
            break;
          case ";":
            classname = "comment";
            if (usedchords) chordline = "";
            line = line.replace(/(https?:[^ ]*)/, '<a href="$1">$1</a>');
            break;
          case "[":
            classname = "section";
            if (usedchords) chordline = "";
            line = line.substr(0, line.length - 1);
            line = line.replace(/^p(\d*)$/i, "Pre Chorus $1");
            line = line.replace(/^v(\d*)$/i, "Verse $1");
            line = line.replace(/^c(\d*)$/i, "Chorus $1");
            line = line.replace(/^b(\d*)$/i, "Bridge $1");
            line = line.replace(/^i(\d*)$/i, "Instrumental $1");
            line = line.replace(/^t(\d*)$/i, "Tag $1");
            break;
          case "-":
            if (usedchords) chordline = "";
            line = "";
            break;
        }

        switch (classname) {
          case "chord":
            break;
          case "lyric":
            // if we aren't showing chords, replace all extra whitespace
            if (!this.showchords) {
              line = line.replace(/^\s+/g, "");
              line = line.replace(/\s+/g, " ");
              line = line.replace(/\s+-\s+/g, "");
            }
            if (!line.match(/^\s*$/)) {
              if (!usedchords || (chordline && !chordline.match(/^\s*$/))) {
                html += `<div class="chord-group">`;
                html += `<div class="chord">${chordline}</div>`;
                html += `<div class="lyric">${line}</div>`;
                html += `</div>`;
                usedchords = true;
              } else {
                html += `<div class="lyric">${line}</div>`;
              }
            } else {
            }
            break;
          default:
            if (chordline && !usedchords) {
              html += `<div class="chord">${chordline}</div>`;
              usedchords = true;
            }
            if (classname) {
              html += `<div class="${classname}">${line}</div>`;
            } else {
              html += `<div class="blank">&nbsp;</div>`;
            }
        }
        i++;
      }
      // do we have an unused chord line?
      if (chordline && !usedchords) {
        html += `<div class="chord">${chordline}</div>`;
      }
      return html;
    },
    prev() {
      window.scrollTo(0, 0);
      this.showall = false;
      const next_song =
        this.current_song_index == null
          ? this.songs.length - 1
          : (this.current_song_index + this.songs.length - 1) %
            this.songs.length;
      this.selectSong(next_song);
    },
    next() {
      window.scrollTo(0, 0);
      this.showall = false;
      const next_song =
        this.current_song_index == null
          ? 1
          : (this.current_song_index + 1) % this.songs.length;
      this.selectSong(next_song);
    },
    transpose(song, inc) {
      if (!song.transpose) song.transpose = 0;
      song.transpose = (24 + inc + song.transpose) % 12; // ensure we mod positive numbers
      console.log(song);
      // this.save();
    },
    capo(song, inc) {
      if (!song.capo) song.capo = 0;
      song.capo = (24 + inc + song.capo) % 12; // ensure we mod positive numbers
      console.log(song);
      // this.save();
    },
    bpm(song, inc) {
      if (!song.bpm) song.bpm = 140;
      song.bpm = inc + song.bpm;
      // bpm = song.bpm; // change the global bpm too
      console.log(song);
      // this.save();
    },
    selectSong(n) {
      if (n < 0) n = 0;
      if (n < this.songs.length) {
        this.current_song_index = n;
        // this.renotify();
      }
    }
  },
  created() {
    window.addEventListener("keydown", e => {
      // ignore repeated keys
      if (e.repeat) return;

      switch (e.code) {
        // case " ":
        // keyCode 32
        case "ArrowRight":
          // keyCode 39
          this.next();
          e.preventDefault(); // don't scroll the screen on arrow key or space
          break;
        case "ArrowLeft":
          // keyCode 37
          this.prev();
          e.preventDefault(); // don't scroll the screen on arrow key
          break;
        case "KeyM":
          // keyCode 77
          this.toggle_metronome();
          break;
        case "KeyN":
          this.nashville = !this.nashville;
          this.renotify();
          break;
        case "Minus":
          break;
        case "Equal":
          break;
        default:
          // numbers from 1-0
          if (e.keyCode >= 48 && e.keyCode <= 57) {
            let song_index = e.keyCode - 48 - 1; // 1 selects song 0, 0 should select song 10
            if (song_index < 0) song_index = 10;
            this.selectSong(song_index);
          }
      }
    });
    this.$root.$data.appBar.buttons = [{
      icon: "mdi-cog-box",
      label: false,
      callback: () => {
        this.show_function_sheet = !this.show_function_sheet;
      }
    }];
  }
});
</script>

<style>
/*songs display*/
#songs {
  padding: 5px;
  box-sizing: border-box;
}
#songs.columns {
  column-count: 1000;
  column-width: 600px;
  column-fill: auto;
  column-gap: 10px;
  /*height:5000px;*/
}
#songs.nocolumns {
  columns: initial !important;
}

.setname {
  position: fixed;
  top: 0;
  left: 0;
  font-size: 12pt;
  background: black;
  padding: 1px 3px;
}
.songnum {
  position: fixed;
  top: 0;
  right: 0;
  font-size: 12pt;
  background: black;
  padding: 1px 3px;
}
.song {
  margin-bottom: 20px;
  border-bottom: 3px solid yellow;
}
.song h3.title {
  color: red;
  font-size: 1.4em;
  margin-bottom: 0;
  margin-top: 15px;
  font-weight: 900;
}

.chordbuttons {
  margin: 10px 0;
}
.chordbuttons button {
  color: black;
  font-size: 20pt;
  border-radius: 2px;
  line-height: 26pt;
  width: 28pt;
}
.transposebutton {
  background: #dd0;
}
.nashvillebutton {
  background: #ad3b3b;
}
.capobutton {
  background: #faf;
}
.bpmbutton {
  background: cyan;
}
.metronomebutton {
  background: #3287ff;
}

.lyrics {
  font-family: "Inconsolata", "Fira Sans Mono", "Roboto Mono", monospace;
  margin: 10px 5px;
  font-weight: 400;
  letter-spacing: -0.03em;
}
.lyrics .lyric,
.lyrics .comment {
  margin-left: 10px;
  text-indent: -10px;
}
.lyrics .comment {
  color: #faa;
  font-size: 0.9em;
  font-style: italic;
  font-family: Muli, sans;
}
.lyrics .blank {
  line-height: 0.5em;
}
.lyrics .section {
  font-family: sans-serif;
  margin-top: 1.2em;
  font-weight: 900;
  text-transform: uppercase;
  color: yellow;
  border-bottom: 1px solid #330;
}
.lyrics .chord {
  color: cyan;
  font-weight: bold;
  margin-top: 0.4em;
  white-space: pre;
}
.lyrics .chord-group {
  break-inside: avoid;
}
.lyrics .chord-group .lyric {
  margin-top: -2px;
  white-space: pre;
}

.lyrics.nocomments .comment {
  display: none;
}

.lyrics.nochords {
  font-family: Muli, sans;
  font-size: 1.2em;
  font-weight: 600;
  letter-spacing: 0em;
}
.lyrics.nochords .chord {
  display: none;
}
.lyrics.nochords .chord-group {
  break-inside: normal;
}
.lyrics.nochords .chord-group .lyric {
  margin-top: -2px;
  white-space: normal;
}

#nav-buttons button {
  cursor: pointer;
  font-size: 50px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.1);
  background: none;
  border: none;
  outline: none;
}
#nav-buttons button.prev {
  position: fixed;
  left: 0;
  top: 50%;
}
#nav-buttons button.next {
  position: fixed;
  right: 0;
  top: 50%;
}
</style>
