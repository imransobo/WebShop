var createError  = require('http-errors');
var express      = require('express');
var path         = require('path');
var cookieParser = require('cookie-parser');
var logger       = require('morgan');
var fileUpload   = require("express-fileupload");
var Chart        = require("chart.js");
var moment       = require("moment");
var nodemailer = require('nodemailer');

var app = express();

app.use('/favicon.ico', express.static('../images/favicon.ico'));
app.use(fileUpload());
app.use(express.static('public'));
app.use('/upload', express.static('./upload/'));

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var kupacRouter = require('./routes/kupac');
var shopRouter  = require('./routes/shop');

//Import
const session  = require("express-session");
const flash    = require("express-flash");
var passport   = require("passport");

var server = require("http").Server(app);
server.listen(3000);
const io = require('socket.io')(server);

const pg       = require("pg");
const bcrypt   = require("bcrypt");
const {reject} = require("bcrypt/promises");


//Passport
const initializePassport = require('./passportConfig');
initializePassport(passport);

app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

app.use(flash());

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');


app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/kupac', kupacRouter);
app.use('/shop', shopRouter);

//IMPORT
var config = {
  user: "",
  database: "",
  password: "",
  host:"",
  port: 5432,
  max: 100,
  idleTimeoutMillis: 30000
};

var pool = new pg.Pool(config);










// WEBSHOP -> RUTE


// Home
app.get('/', function(req, res, next) {
  res.render('home', { title: ''});
});

// O nama
app.get('/aboutUs', (req, res, next) => {
  res.render('o-nama');
})






app.get('/kupac/chatRoom', (req, res, next) => {
  let k        = req.user;
  let korisnik = k.id_kupac;

  pool.query('select * from trgovina;', [], async (err, result) => {
    if(err) {
      console.log(err);
    }
    let korisnici = await result.rows;
    let k = req.user;
    let usernameKupac = k.username_kupac;

    let a = 'adminpanel';
    pool.query('select * from kupac where username_kupac = $1', [a], async (err, result) => {
      if(err) {
        console.log(err);
      }
      let admin = await result.rows;

      res.render('chat-room', { korisnici:korisnici, usernameKupac:usernameKupac, admin: admin});
    })



  })

})


app.get('/chat/:userr', (req, res, next) => {
  let k = req.user;
  let usernameKupac = k.username_kupac;
  let nazivTrg = k.naziv_trg;
  var roomId;

  var to = req.params.userr;
  if(usernameKupac) {
    roomId = usernameKupac + "_" + req.params.userr;
    console.log("logovan kao kupac");
  }

  if(nazivTrg) {
    roomId = req.params.userr + "_" + nazivTrg;
    console.log("logovan kao radnja");

  }


  io.on('connection', socket => {
    console.log('Spojio se korisnik');
    socket.on('join', roomId => socket.join(roomId));
    socket.on('message', msg => {
      socket.broadcast.to(msg.roomId).emit('message', msg.content);
      if(usernameKupac) {
        pool.query('insert into chat values($1,$2,$3)', [usernameKupac, req.params.userr, msg.content]);
      }
    });
  })

  if(usernameKupac) {
    pool.query('select * from chat where user_sender=$1 and user_receiver=$2', [usernameKupac, req.params.userr], async (err, result) => {
      if(err) {
        console.log(err);
      }
      let userr = req.params.userr;
      var poruke = await result.rows;
      return res.render('chat2', { roomId: roomId, to:to , poruke:poruke, usernameKupac: usernameKupac, userr:userr});
    })
  }

  if(nazivTrg) {
    pool.query('select * from chat where user_sender=$1 and user_receiver=$2', [nazivTrg, req.params.userr], async (err, result) => {
      if(err) {
        console.log(err);
      }

      let userr = req.params.userr;
      var poruke = await result.rows;
      return res.render('chat2', { roomId: roomId, to:to , poruke:poruke, nazivTrg:nazivTrg, userr:userr});
    })
  }
  //res.render('chat2', { roomId: roomId, to:to });


})


// NOTIFIKACIJA

io.on("connection", socket => {
  socket.on("dugmeNotif", (podaci) => {
    socket.broadcast.emit("dugmeNotif", podaci);
  })
})




app.get('/shop/chatRoom', (req, res, next) => {

  pool.query('select * from kupac;', async (err, result) => {
    if(err) {
      console.log(err);
    }
    let korisnici = await result.rows;

    res.render('shop-chat-room', {korisnici:korisnici});
  })

})















//KUPAC -> REGISTRACIJA / LOGIN

app.get('/kupac/registracija', checkAuthenticated, function(req, res, next) {
  res.render("registracija", {});
});

app.post('/kupac/registrujKorisnika', async function (req, res, next) {
  let password = req.body.password;
  let errors   = [];

  if (!req.body.ime || !req.body.prezime || !req.body.email || !req.body.username || !req.body.password ||
      !req.body.passwordPonovi || !req.body.datum_r || !req.body.adresa || !req.body.telefon) {
    errors.push( { poruka: 'Morate popuniti sva polja' } );
  }
  if (req.body.password.length < 8) {
    errors.push( { poruka: 'Minimalna dužina šifre je 8 karaktera' } );
  }
  if (req.body.password !== req.body.passwordPonovi) {
    errors.push( { poruka: 'Passwordi se ne podudaraju' } );
  }
  if (errors.length > 0) {
    res.render('registracija', { errors: errors })
  }

  let hashedPass = await bcrypt.hash(password, 10);
  pool.query(`select * from kupac where email = $1 or username_kupac = $2;`, [req.body.email, req.body.username], async (err, result) => {
    if(err) {
      console.log(err);
    }

    if(result.rows.length > 0) {
      errors.push({poruka: 'Korisnik sa tim mailom je već registrovan.'});
      res.render('registracija', {errors: errors });
    }
    else {
      pool.query(`insert into kupac(ime_kupac, prezime_kupac, username_kupac, datum_r_kupac, adresa_kupac, telefon_kupac, email, password, interesi, uloga)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`, [req.body.ime, req.body.prezime, req.body.username, req.body.datum_r,
        req.body.adresa, req.body.telefon, req.body.email, hashedPass, req.body.interesi, 'kupac']),
          (err, result) => {
            if (err) {
              res.send(500);
              console.log(err);
            }

          }
          req.flash("success_msg", 'Uspješna registracija.Možete se ulogovati.')
          res.redirect('/kupac/login');

    }
  });

});


//KUPAC -> KORPA
app.get('/kupac/korpa', checkNotAuthenticated, async (req, res, next) => {
    var idK  = req.user.id_kupac;
    var m    = req.user;
    var mail = m.email;
    console.log(mail);
    var podaci;
    pool.query('select * from narudzba where id_kupac = $1', [idK], async (err, result) => {
      if(err)
        console.log(err);
      podaci = await result.rows;
      res.render('kupac-korpa', { podaci:podaci , mail:mail})
    });

});


app.post('/dodaj-u-korpu', checkNotAuthenticated, (req, res, next) => {
  var idKupca    = req.user.id_kupac;
  var idTrg      = req.body.idTrg;
  var idArt      = req.body.idArt;
  var kolicina   = req.body.kolicina;
  var cijena     = req.body.cijena;
  var naziv      = req.body.naziv;
  var mailRadnje = req.body.mailRadnje;

  pool.query('insert into narudzba(id_trg, id_kupac, kolicina, cijena, id_artikla, naziv) values($1, $2, $3, $4, $5, $6)', [idTrg, idKupca, kolicina, cijena, idArt, naziv], (err, result) => {
    if(err)
      console.log(err);

    console.log("insert prosao");

    var transporter = nodemailer.createTransport({
      host: "smtp-mail.outlook.com",
      secureConnection: false,
      port: 587,
      tls: {
        ciphers:'SSLv3'
      },
      auth: {
        user: '',
        pass: ''
      }
    });

    var mailOptions = {
      from: '"WebShop " <sobo_imran@outlook.com>', // sender address (who sends)
      to: 'imranjedantri@gmail.com', // list of receivers (who receives)
      subject: 'Hello ', // Subject line
      text: 'Vaša narudžba je uspješno kreirana.' +
          'Detalji vaše narudžbe: ' +
          'Naziv artikla: ' + naziv +
          'Cijena artikla: ' + cijena + '.', // plaintext body
      html: '<b>WebShop - Vaša narudžba je uspješno kreirana </b><br> '// html body
    };

    transporter.sendMail(mailOptions, function(error, info){
      if(error){
        return console.log(error);
      }

      console.log('Message sent: ' + info.response);
    });

    res.redirect('/kupac/korpa');
  })

});


app.post('/obrisiNarudzbu', checkNotAuthenticated, (req, res, next) => {
  let id = req.body.idNarudzbe;
  pool.query('delete from narudzba where id_narudzbe = $1', [id], async (err, result) => {
    if(err) {
      console.log(err);
    }
    await res.redirect('/kupac/korpa');
  })
})


app.get('/kupac/login', checkAuthenticated, (req,res,next) => {
  res.render('login');
});


app.get('/kupac/dashboard/:email', checkNotAuthenticated, async (req, res, next) => {
  console.log(req.user);
  pool.query('select * from artikal;', async (err, result) => {
    if(err) {
      console.log(err);
    }
    let email           = req.params.email;
    let k               = req.user;
    let korisnik_mail   = k.email;
    let datumRodjenja   = k.datum_r_kupac;
    let usernameKupac   = k.username_kupac;
    let idKupac         = k.id_kupac;
    let datumFormatiran = moment(datumRodjenja).format('MM-DD');
    let datumDanas      = moment(Date.now()).format('MM-DD');
    let jeLiRodjendan;

    jeLiRodjendan = datumFormatiran === datumDanas;
    console.log(jeLiRodjendan);

    var sviArtikli = await result.rows;



    pool.query(`select artikal.id_artikla,naziv,kolicina,cijena,slika,kategorija_art,opis, id_trg, avg(ocjena) from artikal inner join ocjene_artikal oa on artikal.id_artikla = oa.id_artikla group by artikal.naziv,
                                                                                                                                                 artikal.kolicina,
                                                                                                                                                 artikal.cijena,
                                                                                                                                                 artikal.slika,
                                                                                                                                                 artikal.kategorija_art,
                                                                                                                                                 artikal.id_trg,
                                                                                                                                                 artikal.opis,
                                                                                                                                                 artikal.id_artikla
                                                                                                                                                 
        having avg(ocjena) >= 4.0;`, [], async (err, result) => {
      if(err) {
        console.log(err)
      }
      let popularni = await result.rows;
      pool.query('select * from interesi where id_kupac=$1', [idKupac], async (err, result) => {
        if(err) {
          console.log(err);
        }
        let preporuceni = await result.rows;

        console.log("dobio popularne" + JSON.stringify(popularni));
        res.render('dashboard', { sviArtikli:sviArtikli, email: email, korisnik_mail:korisnik_mail, jeLiRodjendan:jeLiRodjendan, usernameKupac:usernameKupac, popularni:popularni, preporuceni:preporuceni });
      })

    })


  })

})


app.post('/pretraga', (req, res, next) => {
  var kljucnaRijec = req.body.search;
  console.log(kljucnaRijec);
    pool.query('select * from kupac where username_kupac ilike $1;', [`%${kljucnaRijec}%`], async (err, result) => {
    if(err) {
      console.log(err);
    }
    var kupci = await result.rows;
    console.log(kupci);
    pool.query('select * from artikal where naziv ilike $1;', [`%${kljucnaRijec}%`], async (err, result) => {
      if(err) {
        console.log(err);
      }
      var artikli = await result.rows;
      console.log(artikli);
      pool.query('select * from trgovina where naziv_trg ilike $1;', [`%${kljucnaRijec}%`], async (err, result) => {
        if(err) {
          console.log(err);
        }
        var trgovine = await result.rows;
        console.log(trgovine);
        pool.query('select * from artikal where kategorija_art ilike $1', [`%${kljucnaRijec}%`], async (err, result) => {
          if(err) {
            console.log(err);
          }
          var kategorije = await result.rows;
          console.log(kategorije);
          res.render('pretraga-rezultati', {kupci:kupci, artikli:artikli, trgovine:trgovine, kategorije:kategorije});
        })


      })

    })


  })


});


app.post('/kupacLogin',
    passport.authenticate('passportUser'),
    function(req, res) {
      res.redirect('/kupac/dashboard/' + req.body.email);

});


app.get('/logout', (req, res, next) => {
  req.logOut();
  req.flash('success_msg', 'Odlogovali ste se.');
  res.redirect('/kupac/login');
})




app.get('/kupac/artikal/:id', checkNotAuthenticated, async (req, res, next) => {
  var podaci;
  var podaciRadnja;
  var id    = req.params.id;
  var email = req.user.email_trg;
  console.log(req.user.email_trg);


  io.on('connection', socket => {
    console.log('Spojio se korisnik');
    socket.on('join', roomId => socket.join(roomId));
    socket.on('notifikacija', msg => {
      socket.broadcast.emit('notifikacija', msg.content);
    });
  })


  pool.query('select * from artikal inner join trgovina t on artikal.id_trg = t.id_trg where id_artikla = $1;', [id], async (err, result) => {
    if (err) {
      return res.redirect('/kupac/dashboard');
    }
    podaci = await result.rows;
    console.log(podaci);
    let idRadnje = podaci[0].id_trg;
    console.log(JSON.stringify(podaci[0].id_trg));

    pool.query('select * from trgovina where id_trg = $1', [idRadnje], async (err, result) => {
      if(err) {
        return res.redirect('/kupac/dashboard');
      }
      podaciRadnja = await result.rows;

      res.render('artikal', { podaci: podaci, podaciRadnja: podaciRadnja, id:id});

    })


  })

});


app.post('/kupac/ocijeniArtikal', (req, res, next) => {
  let user = req.user;
  let idK = user.id_kupac;
  let idArtikla = req.body.podatak0;
  let ocjena = req.body.izbor;

  pool.query('insert into ocjene_artikal values($1,$2,$3);', [idK, idArtikla, ocjena], (err, result) => {
    if(err) {
      console.log(err);
    }
    console.log('artikal ocijenjen');
    res.redirect('/kupac/artikal/' + idArtikla);
  })

})


// Profil korisnika i uređivanje podataka
app.get('/kupac/profil', checkNotAuthenticated, (req, res, next) => {
  let k             = req.user;
  let trenutniKupac = k.email;

  pool.query('select * from kupac where email=$1', [trenutniKupac], async (err,result) => {
    if(err) {
      console.log(err);
    }
    let podaci = await result.rows;
    res.render('kupac-profil', { podaci: podaci })
  })

})

app.post('/kupac/uploadProfilna', (req, res, next) => {
  const slika = req.files.slika;
  console.log(slika);
  const uploadPath = __dirname + '/upload/' + slika.name;

  let kupac = req.body.kupac;

  pool.query('update kupac set profilna_slika=$1 where username_kupac=$2', [slika.name, kupac], async (err, result) => {
    if (err) {
      console.log("nije uploadovana");
      console.log(err);
    }
    console.log('slika uploadovana uspjesno');

    slika.mv(uploadPath, async function (err) {
      if (err) {
        return res.status(500).send(err);
      }
    })


    res.redirect('/kupac/profil');
  })

})


app.get('/kupac/urediProfil', checkNotAuthenticated, (req, res, next) => {
  let k             = req.user;
  let trenutniKupac = k.email;

  pool.query('select * from kupac where email=$1', [trenutniKupac], async (err,result) => {
    if(err) {
      console.log(err);
    }
    let podaci = await result.rows;
    res.render('kupac-profil-edit', { podaci: podaci })
  })


})


app.post('/kupac/uredi', checkNotAuthenticated, (req, res, next) => {
  let username = req.body.username;
  let ime      = req.body.ime;
  let prezime  = req.body.prezime;
  let adresa   = req.body.adresa;

  pool.query('update kupac set username_kupac=$1, ime_kupac=$2, prezime_kupac=$3, adresa_kupac=$4 where username_kupac=$5;', [username,ime,prezime,adresa,username], async (err,result) => {
    if(err) {
      console.log(err);
    }
    console.log('editovan profil');
    await res.redirect('/kupac/profil');
  })

});


app.get('/kupac/promijeniSifru', checkNotAuthenticated, (req, res, next) => {
  res.render('kupac-sifra-edit', {});
})


app.post('/kupac/passwordUpdate', checkNotAuthenticated, async (req, res, next) => {
  var err = [];
  let staraSifra = req.body.stara;
  let novaSifra = req.body.nova;
  let novaSifraPonovo = req.body.nova_ponovo;

  let k = req.user;
  let trenutniKupac = k.email;

  if (!staraSifra || !novaSifra || !novaSifraPonovo) {
    err.push({poruka: 'Nijedno polje ne smije biti prazno'});
  }

  let staraSifraHashed = await bcrypt.hash(staraSifra, 10);
  console.log(staraSifraHashed);

  pool.query('select * from kupac where email=$1', [trenutniKupac], async (err, result) => {
    if (err) {
      console.log(err);
    }
    let sifraBaza = await result.rows[0];
    console.log("sifra iz baze: " + sifraBaza.password);
    if(result.rows.length > 0) {
      bcrypt.compare(staraSifraHashed, sifraBaza.password, async (err, data) => {
        if (err) {
          throw err;
        }
        console.log("usporedio stare sifre uspjesno");
        if (novaSifra === novaSifraPonovo) {
          let hashedPass = await bcrypt.hash(novaSifra, 10);
          pool.query('update kupac set password=$1 where email=$2;', [hashedPass, trenutniKupac], async (err, result) => {
            if (err) {
              console.log(err);
            }
            console.log('password promijenjen');
            //err.push({poruka: 'Šifra uspješno promijenjena'});
            return res.redirect('/kupac/profil');
          })
        }


      })
    }


  })
})


app.post('/kupac/sortirajDashboard', (req, res, next) => {
  var sviArtikli;
  let k             = req.user;
  let korisnik_mail = k.email;
  console.log(korisnik_mail);
  let datumRodjenja   = k.datum_r_kupac;
  let usernameKupac   = k.username_kupac;

  let datumFormatiran = moment(datumRodjenja).format('MM-DD');
  let datumDanas      = moment(Date.now()).format('MM-DD');
  let jeLiRodjendan;

  jeLiRodjendan = datumFormatiran === datumDanas;
  console.log(jeLiRodjendan);
  if(req.body.opcije === "Imenu") {
    pool.query('select * from artikal order by naziv;' , async (err, result) => {
      if(err) {
        console.log(err);
      }
      sviArtikli = await result.rows;
      pool.query(`select artikal.id_artikla,naziv,kolicina,cijena,slika,kategorija_art,opis, id_trg, avg(ocjena) from artikal inner join ocjene_artikal oa on artikal.id_artikla = oa.id_artikla group by artikal.naziv,
                                                                                                                                                 artikal.kolicina,
                                                                                                                                                 artikal.cijena,
                                                                                                                                                 artikal.slika,
                                                                                                                                                 artikal.kategorija_art,
                                                                                                                                                 artikal.id_trg,
                                                                                                                                                 artikal.opis,
                                                                                                                                                 artikal.id_artikla
                                                                                                                                                 
        having avg(ocjena) >= 4.0;`, [], async (err, result) => {
        if(err) {
          console.log(err)
        }
        let popularni = await result.rows;
        console.log("dobio popularne" + JSON.stringify(popularni));
        res.render('dashboard', { sviArtikli: sviArtikli, jeLiRodjendan: jeLiRodjendan, usernameKupac:usernameKupac, popularni:popularni});
      })


    })

  }

  if(req.body.opcije === "Cijeni") {
    pool.query('select * from artikal order by cijena;' , async (err, result) => {
      if(err) {
        console.log(err);
      }
      sviArtikli = await result.rows;
      pool.query(`select artikal.id_artikla,naziv,kolicina,cijena,slika,kategorija_art,opis, id_trg, avg(ocjena) from artikal inner join ocjene_artikal oa on artikal.id_artikla = oa.id_artikla group by artikal.naziv,
                                                                                                                                                 artikal.kolicina,
                                                                                                                                                 artikal.cijena,
                                                                                                                                                 artikal.slika,
                                                                                                                                                 artikal.kategorija_art,
                                                                                                                                                 artikal.id_trg,
                                                                                                                                                 artikal.opis,
                                                                                                                                                 artikal.id_artikla
                                                                                                                                                 
        having avg(ocjena) >= 4.0;`, [], async (err, result) => {
        if(err) {
          console.log(err)
        }
        let popularni = await result.rows;
        console.log("dobio popularne" + JSON.stringify(popularni));
        res.render('dashboard', { sviArtikli: sviArtikli , jeLiRodjendan:jeLiRodjendan, usernameKupac:usernameKupac, popularni:popularni});
      })


    })

  }

});


app.get('/kupac/:firma', checkNotAuthenticated, async (req, res, next) => {
  var firma = req.params.firma;
  console.log(firma);
  let podaci;
  pool.query('select * from artikal inner join trgovina t on artikal.id_trg = t.id_trg where naziv_trg = $1;', [firma], async (err, result) => {
    if(err) {
      console.log(err);
    }
    podaci = await result.rows;
    console.log(podaci);

    pool.query('select * from recenzija where naziv_trg=$1', [firma], async (err, result) => {
      if(err) {
        console.log(err);
      }
      let recenzije = await result.rows;
      console.log(recenzije);

      pool.query('select * from trgovina where naziv_trg=$1', [firma], async (err, result) => {
        if(err) {
          console.log(err);
        }
        console.log('dobio podatke o radnji');
        let radnja = await result.rows;

        res.render('kupac-view-firma', { podaci: podaci, firma:firma, recenzije:recenzije, radnja:radnja});
      })


    })


  })

});

app.get('/sort/:trgovina/:parametar', (req, res, next) => {
  let parametar = req.params.parametar;
  let firma  = req.params.trgovina;

  if(parametar === "Imenu") {
    pool.query('select * from artikal inner join trgovina t on artikal.id_trg = t.id_trg where naziv_trg = $1 order by naziv;', [firma], async (err, result) => {
      if (err) {
        console.log(err);
      }
      console.log('sortirao po imenu');
      let podaci = await result.rows;
      pool.query('select * from recenzija where naziv_trg=$1', [firma], async (err, result) => {
        if(err) {
          console.log(err);
        }
        let recenzije = await result.rows;
        console.log(recenzije);

        pool.query('select * from trgovina where naziv_trg=$1', [firma], async (err, result) => {
          if(err) {
            console.log(err);
          }
          let radnja = await result.rows;

          res.render('kupac-view-firma', { podaci: podaci, firma:firma, recenzije:recenzije, radnja:radnja});
        })


      })
    })
  }
  if(parametar === "Cijeni") {
    pool.query('select * from artikal inner join trgovina t on artikal.id_trg = t.id_trg where naziv_trg = $1 order by naziv;', [firma], async (err, result) => {
      if (err) {
        console.log(err);
      }
      console.log('sortirao po imenu');
      let podaci = await result.rows;
      pool.query('select * from recenzija where naziv_trg=$1', [firma], async (err, result) => {
        if(err) {
          console.log(err);
        }
        let recenzije = await result.rows;
        console.log(recenzije);

        pool.query('select * from trgovina where naziv_trg=$1', [firma], async (err, result) => {
          if(err) {
            console.log(err);
          }
          let radnja = await result.rows;

          res.render('kupac-view-firma', { podaci: podaci, firma:firma, recenzije:recenzije, radnja:radnja});
        })


      })

    })
  }

})


app.post('/kupac/sortiraj', async (req, res, next) => {
  let naziv = req.body.naziv;
  let nazivTrg = JSON.parse(naziv);
  console.log(req.body.opcije);
  console.log(nazivTrg + " naziv trgg")

  res.redirect('/sort/' + nazivTrg + '/' + req.body.opcije);


})


app.post('/kupac/ostaviRecenziju', (req, res, next) => {
  let user     = req.user;
  let username = user.username_kupac;
  let f        = req.body.firma;
  let firma    = JSON.parse(f);
  let komentar = req.body.komentar;
  let ocjena   = req.body.izbor;
  pool.query('insert into recenzija(komentar,ocjena,username_kupac,naziv_trg) values($1,$2,$3,$4);', [komentar, ocjena, username, firma], async (err, result) => {
    if(err) {
      console.log(err);
    }
    console.log('unesena recenzija za firmu: ' + firma);
    await res.redirect('/kupac/' + firma);

  })
})










//Funkcije za preusmjeravanje korisnika ako nije ulogovan
function checkAuthenticated(req, res, next) {
  if(req.isAuthenticated()) {
    return res.redirect('/kupac/profil');
  }
  next();
}

function checkNotAuthenticated(req, res, next) {
  if(req.isAuthenticated()) {
    return next();
  }
  res.redirect('/kupac/login');
}











//TRGOVINA -> REGISTRACIJA / LOGIN

app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());


const initializeShop = require('./passportShop');
initializeShop(passport);



function checkShopAuthenticated(req, res, next) {
  if(req.isAuthenticated()) {
    return res.redirect('/shop/dashboard');
  }
  next();
}

function checkShopNotAuthenticated(req, res, next) {
  if(req.isAuthenticated()) {
    return next();
  }
  res.redirect('/shop/login');
}

//TRGOVINA -> REGISTRACIJA / LOGIN

app.get('/shop/dashboard',  checkShopNotAuthenticated, async function(req, res, next) {
  let trgovina = res.locals.currentUser;
  trgovina = req.user;
  console.log(trgovina.id_trg);
  var sviArtikli;

  pool.query('select * from artikal where id_trg = $1;', [trgovina.id_trg], async (err, result) => {
    if (err) {
      console.log(err);
    }
    sviArtikli = await result.rows;

    let shop;
    pool.query('select * from trgovina where id_trg = $1;', [trgovina.id_trg], async (err, result) => {
      if (err) {
        console.log(err);
      }
      shop = await result.rows;

      res.render('dashboard-trgovina', { sviArtikli: sviArtikli, shop: shop });

    })



  })



});


app.get('/shop/registracija', checkShopAuthenticated, function(req, res, next) {
  const vrstaUsluga = [
    {ime: 'Prodaja vozila'},
    {ime: 'Nekretnine'},
    {ime: 'Mobilni uređaji'},
    {ime: 'Kompjuteri'},
    {ime: 'Tehnika'},
    {ime: 'Nakit'},
    {ime: 'Knjige'},
    {ime: 'Muzička oprema'},
    {ime: 'Sportska oprema'},
    {ime: 'Kolekcionarstvo'},
    {ime: 'Bicikli'},
    {ime: 'Odjeća'},
    {ime: 'Namještaj'},
    {ime: 'Kamere'},
    {ime: 'Hardver'},
    {ime: 'Uređaji/mašine'},
  ]

  res.render('registracija-trgovine', { vrstaUsluga: vrstaUsluga });
});

app.get('/shop/login', checkShopAuthenticated, function(req, res, next) {
  res.render('login-trgovina');
});


app.post('/shop/shopLogin',
    passport.authenticate('passportShop'),
    function(req, res) {
      res.redirect('/shop/dashboard/');

});




app.post('/registruj', async function(req, res, next) {
  const vrstaUsluga = [
    {ime: 'Prodaja vozila'},
    {ime: 'Nekretnine'},
    {ime: 'Mobilni uređaji'},
    {ime: 'Kompjuteri'},
    {ime: 'Tehnika'},
    {ime: 'Nakit'},
    {ime: 'Knjige'},
    {ime: 'Muzička oprema'},
    {ime: 'Sportska oprema'},
    {ime: 'Kolekcionarstvo'},
    {ime: 'Bicikli'},
    {ime: 'Odjeća'},
    {ime: 'Namještaj'},
    {ime: 'Kamere'},
    {ime: 'Hardver'},
    {ime: 'Uređaji/mašine'},
  ]
  let password = req.body.password;
  let errors = [];

  if (!req.body.nazivTrgovine || !req.body.kontaktTelefon || !req.body.email || !req.body.adresaSjedista || !req.body.password ||
      !req.body.passwordPonovi || !req.body.izbor) {
    errors.push( { poruka: 'Morate popuniti sva polja' } );
  }

  if (password.length < 8) {
    errors.push( { poruka: 'Minimalna dužina šifre je 8 karaktera' } );
  }

  if (password !== req.body.passwordPonovi) {
    errors.push( { poruka: 'Passwordi se ne podudaraju' } );
  }

  let passw = await bcrypt.hash(password, 10);
  if (errors.length > 0) {
    res.render('registracija-trgovine', { errors: errors , vrstaUsluga: vrstaUsluga })
  }else {
    pool.query(`select * from trgovina where email_trg = $1 or naziv_trg = $2;`, [req.body.email, req.body.nazivTrgovine], (err, result) => {
      if(err) {
        console.log(err);
      }

      if(result.rows.length > 0) {
        errors.push({poruka: 'Korisnik sa tim mailom je već registrovan.'});
        res.render('registracija-trgovine', {errors: errors });
      }
      else {
        pool.query(`insert into trgovina(naziv_trg, telefon_trg, email_trg, sjediste_trg, password, kategorija)
         values ($1, $2, $3, $4, $5, $6);`, [req.body.nazivTrgovine, req.body.kontaktTelefon, req.body.email, req.body.adresaSjedista,
          passw, req.body.izbor]),
            (err, result) => {
              if (err) {
                res.send(500);
                console.log(err);
              }

            }
        req.flash("success_msg", 'Uspješno ste registrovali Vašu trgovinu.Možete se ulogovati.')
        res.redirect('/shop/login');

      }
    });

  }


});

app.get('/shop/logout', function(req, res, next) {
  req.logOut();
  req.flash('success_msg', 'Odlogovali ste se.');
  res.redirect('/shop/login');
});


//Password change
app.get('/shop/promijeniSifru', (req, res, next) => {
  console.log(req.user);
  res.render('shop-sifra-edit', {});

})

app.post('/shop/passwordUpdate', async (req, res, next) => {
  var err = [];
  let staraSifra = req.body.stara;
  let novaSifra = req.body.nova;
  let novaSifraPonovo = req.body.nova_ponovo;


  let k = req.user;
  console.log(k);
  let trenutnaTrgovina = k.email_trg;
  let nazivRadnje = k.naziv_trg;

  if (!staraSifra || !novaSifra || !novaSifraPonovo) {
    err.push({poruka: 'Nijedno polje ne smije biti prazno'});
  }

  let staraSifraHashed = await bcrypt.hash(staraSifra, 10);
  console.log(staraSifraHashed);

  pool.query('select * from trgovina where email_trg=$1', [trenutnaTrgovina], async (err, result) => {
    if (err) {
      console.log(err);
    }
    let sifraBaza = await result.rows[0];
    console.log("sifra iz baze: " + sifraBaza.password);
    if (result.rows.length > 0) {
      bcrypt.compare(staraSifraHashed, sifraBaza.password, async (err, data) => {
        if (err) {
          throw err;
        }
        console.log("usporedio stare sifre uspjesno");
        if (novaSifra === novaSifraPonovo) {
          let hashedPass = await bcrypt.hash(novaSifra, 10);
          pool.query('update trgovina set password=$1 where email_trg=$2;', [hashedPass, trenutnaTrgovina], async (err, result) => {
            if (err) {
              console.log(err);
            }
            console.log('password promijenjen');
            //err.push({poruka: 'Šifra uspješno promijenjena'});
            return res.redirect('/shop/' + nazivRadnje);
          })
        }


      })
    }


  })

})




app.get('/shop/unosArtikla', (req, res, next) => {

  const vrstaUsluga = [
    {ime: 'Prodaja vozila'},
    {ime: 'Nekretnine'},
    {ime: 'Mobilni uređaji'},
    {ime: 'Kompjuteri'},
    {ime: 'Tehnika'},
    {ime: 'Nakit'},
    {ime: 'Knjige'},
    {ime: 'Muzička oprema'},
    {ime: 'Sportska oprema'},
    {ime: 'Kolekcionarstvo'},
    {ime: 'Bicikli'},
    {ime: 'Odjeća'},
    {ime: 'Namještaj'},
    {ime: 'Kamere'},
    {ime: 'Hardver'},
    {ime: 'Uređaji/mašine'},
  ]

  res.render('unos-artikla', {vrstaUsluga: vrstaUsluga});
});

app.post('/unesi', (req, res, next) => {
  let trgovina = res.locals.currentUser
  trgovina= req.user;
  let trgovinaId = trgovina.id_trg;


  let errors = [];
  const vrstaUsluga = [
    {ime: 'Prodaja vozila'},
    {ime: 'Nekretnine'},
    {ime: 'Mobilni uređaji'},
    {ime: 'Kompjuteri'},
    {ime: 'Tehnika'},
    {ime: 'Nakit'},
    {ime: 'Knjige'},
    {ime: 'Muzička oprema'},
    {ime: 'Sportska oprema'},
    {ime: 'Kolekcionarstvo'},
    {ime: 'Bicikli'},
    {ime: 'Odjeća'},
    {ime: 'Namještaj'},
    {ime: 'Kamere'},
    {ime: 'Hardver'},
    {ime: 'Uređaji/mašine'},
  ]

  let kratakOpis = req.body.kratakOpis;

  if (!req.body.nazivArtikla || !req.body.kratakOpis || !req.body.cijenaArtikla || !req.files.slikaArtikla ||  !req.body.izbor) {
    errors.push( { poruka: 'Morate popuniti sva polja' } );
  }

  if (kratakOpis.length < 10 ) {
    errors.push( { poruka: 'Unesite barem 10 znakova' } );
  }

  const slika = req.files.slikaArtikla;
  console.log(slika);
  const uploadPath = __dirname + '/upload/' + slika.name;


  if (errors.length > 0) {
    res.render('unos-artikla', { errors: errors , vrstaUsluga: vrstaUsluga })
  } else {

    pool.query(`insert into artikal(id_trg, naziv, kolicina, cijena, opis, slika, kategorija_art) values($1, $2, $3, $4, $5, $6, $7);`, [trgovinaId, req.body.nazivArtikla, req.body.kolicina, req.body.cijenaArtikla,
      req.body.kratakOpis, slika.name, req.body.izbor], (err, result) => {
      if(err) {
        console.log(err);
      }
      console.log("artikal dodan uspjesno");
      res.redirect('/shop/dashboard');
    });

    slika.mv(uploadPath, function(err) {
      if(err) {
        return res.status(500).send(err);
      }
    })


  }

});


app.get('/shop/artikal/:id', async (req, res, next) => {
  var podaci;
  var id = req.params.id;

  pool.query('select id_artikla,naziv,kolicina,cijena,opis,slika from artikal where id_artikla = $1;', [id], async (err, result) => {
    if (err) {
      res.redirect('/kupac/dashboard');
    }
    podaci = await result.rows;
    res.render('artikal-edit-1', { podaci: podaci});
  })

});


app.get('/urediArtikal/:id', (req, res, next) => {
  let id = req.params.id;
  var podaci;
  pool.query('select * from artikal where id_artikla = $1', [id], async (err, result) => {
    if (err) {
      console.log(err);
    }
    podaci = await result.rows;
    res.render('artikal-edit-2', { podaci: podaci });
  })

})

app.post('/edituj', async (req, res, next) => {
  //const slika = req.files.slikaArtikla;
  //console.log(slika);
  //const uploadPath = __dirname + '/upload/' + slika.name;

  let err = [];
  if(!req.body.imeArtikla || !req.body.kolicina || !req.body.cijena || !req.body.opis) {
    err.push({poruka: 'Polja ne smiju biti prazna!'});
  }

  pool.query('update artikal set naziv = $1, kolicina = $2, cijena = $3, opis=$4  where id_artikla = $5',
      [req.body.imeArtikla, req.body.kolicina ,req.body.cijena, req.body.opis, req.body.idArtikla ], async (err, result) => {
    if(err) {
      console.log(err);
    }
    /*slika.mv(uploadPath,  async function(err) {
          if(err) {
            console.log(err);
          }
        })*/
    console.log("promjene spašene");
    await res.redirect('/shop/dashboard');

  });



});


app.post('/obrisiArtikal/:id', (req, res, next) => {
  let id = req.params.id;
  pool.query('delete from artikal where id_artikla = $1;', [id], async (err, result) => {
    if(err) {
      console.log(err);
    }
    console.log('obrisan artikal sa id = ' + id);
    await res.redirect('/shop/dashboard');
  });
});


app.get('/shop/:radnja', (req, res, next) => {
  let naziv = req.params.radnja;
  let podaci;
  pool.query('select * from trgovina where naziv_trg = $1', [naziv], async (err, result) => {
    if(err) {
      console.log(err);
    }
    podaci = await result.rows;

    pool.query('select * from recenzija where naziv_trg=$1', [naziv], async (err, result) => {
      if(err) {
        console.log(err);
      }
      let recenzije = await result.rows;
      res.render('shop-profil', {podaci: podaci, recenzije:recenzije} )
    })
  })

});


app.get('/urediProfil/:radnja', (req, res, next) => {
  let radnja = req.params.radnja;
  let podaci;
  pool.query('select * from trgovina where naziv_trg = $1;', [radnja], async (err, result) => {
    if(err) {
      console.log(err);
    }

    podaci = await result.rows;

    res.render('shop-profil-edit', {podaci: podaci});
  })

})

app.post('/urediProfil', (req, res, next) => {
  pool.query('update trgovina set naziv_trg=$1, telefon_trg=$2, sjediste_trg=$3 where id_trg = $4;', [req.body.naziv, req.body.broj, req.body.sjediste, req.body.id], (err, result) => {
    if(err) {
      console.log(err);
    }

    res.redirect('/shop/dashboard');
  })
});






// SHOP-KORPA
app.get('/shop/korpa/:id', (req, res, next) => {
  let id = req.params.id;
  let podaci;
  pool.query('select * from narudzba where id_trg = $1 order by status;', [id], async (err, result) => {
    if(err) {
      console.log(err);
    }
    podaci = await result.rows;
    res.render('shop-korpa', {podaci: podaci});
  })

});


app.post('/shop/obrisiNarudzbu', (req, res, next) => {
  let id = req.body.idNarudzbe;
  pool.query('delete from narudzba where id_narudzbe = $1', [id], async (err, result) => {
    if(err) {
      console.log(err);
    }

    res.redirect('/shop/dashboard');
  })

});

app.post('/potvrdiNarudzbu', (req, res, next) => {
  let id = req.body.idN;
  let cijena = req.body.cijena;
  let idTrg = req.body.idTrg;

  pool.query("update narudzba set status = 'isporučeno' where id_narudzbe = $1", [id], async (err, result) => {
    if(err){
      console.log(err);
    }
    console.log("narudzba potvrdena");
    pool.query('update trgovina set zarada = zarada + $1 where id_trg = $2;', [cijena, idTrg], async (err, result) => {
      if(err) {
        console.log(err);
      }
      console.log('zarada povecana');
    })
    var transporter = nodemailer.createTransport({
      host: "smtp-mail.outlook.com",
      secureConnection: false,
      port: 587,
      tls: {
        ciphers:'SSLv3'
      },
      auth: {
        user: 'sobo_imran@outlook.com',
        pass: 'nodenode321'
      }
    });

    var mailOptions = {
      from: '"WebShop " <sobo_imran@outlook.com>', // sender address (who sends)
      to: 'imranjedantri@gmail.com', // list of receivers (who receives)
      subject: 'Hello ', // Subject line
      text: 'Vaša narudžba je potvrđena.',
      html: '<b>WebShop - Vaša narudžba je potvrđena </b><br> '// html body
    };

    // send mail with defined transport object
    transporter.sendMail(mailOptions, function(error, info){
      if(error){
        return console.log(error);
      }

      console.log('Message sent: ' + info.response);
    });

    res.redirect('/shop/korpa/' + idTrg);
  })
});


app.post('/shop/uploadProfilna', (req, res, next) => {
  const slika = req.files.slika;
  console.log(slika);
  const uploadPath = __dirname + '/upload/' + slika.name;

  let radnja = req.body.radnja;

  pool.query('update trgovina set profilna=$1 where naziv_trg=$2', [slika.name, radnja], async (err, result) => {
    if(err) {
      console.log("nije uploadovana");
      console.log(err);
    }
    console.log('slika uploadovana uspjesno');

    slika.mv(uploadPath, async function(err) {
      if(err) {
        return res.status(500).send(err);
      }
    })


    res.redirect('/shop/' + radnja);
  })


})













// ADMIN

app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());


const initializeAdmin = require('./passportAdmin');
initializeAdmin(passport);



function checkAdminAuthenticated(req, res, next) {
  if(req.isAuthenticated()) {
    return res.redirect('/admin/panel');
  }
  next();
}

function checkAdminNotAuthenticated(req, res, next) {
  if(req.isAuthenticated()) {
    return next();
  }
  res.redirect('/admin');
}


app.get('/admin', checkAdminAuthenticated, (req,res, next) => {
  res.render('admin')
});

app.post('/adminLogin', passport.authenticate('passportAdmin'), function(req, res) {
      res.redirect('/admin/panel');
});

app.get('/admin/logout', (req, res, next) => {
  req.logOut();
  req.flash('success_msg', 'Odlogovali ste se.');
  res.redirect('/');
})

app.get('/admin/panel', checkAdminNotAuthenticated, (req, res, next) => {
  pool.query('select * from kupac;', async (err, result) => {
    if(err) {
      console.log(err);
    }
    var kupac = await result.rows;
    var brKupaca = await result.rowCount;
    console.info(kupac);

    pool.query('select * from artikal;', async (err, result) => {
      if (err) {
        console.log(err);
      }
      var artikal = await result.rows;
      var brArtikala = await result.rowCount;
      console.info(artikal);
      pool.query('select * from narudzba;', async (err, result) => {
        if (err) {
          console.log(err);
        }
        var narudzba = await result.rows;
        var brNarudzbi = await result.rowCount;
        console.info(narudzba);

        pool.query('select * from trgovina;', async (err, result) => {
          if(err) {
            console.log(err);
          }
          var trgovina = await result.rows;
          var brTrgovina = await result.rowCount;
          pool.query("select date_part('year' ,age(current_date, datum_r_kupac)) from kupac;", async (err, result) => {
            if(err) {
              console.log(err);
            }
            var godineKupaca = await result.rows;
            console.log(godineKupaca);
            res.render('adminPanel', {kupac: kupac, brKupaca: brKupaca, artikal:artikal, brArtikala: brArtikala, narudzba: narudzba, brNarudzbi: brNarudzbi,
              trgovina:trgovina, brTrgovina: brTrgovina, godineKupaca: godineKupaca});

          })
        })

      })
    })

  })


})

app.post('/admin/obrisiArtikal', checkAdminNotAuthenticated,(req, res, next) => {
  let id = req.body.idArtikla;
  console.log('id artikla koji brisem' + id);
  pool.query('delete from artikal where id_artikla=$1', [id], (err, result) => {
    if(err) {
      console.log(err);
    }
    res.redirect('/admin/panel');
  })
})


app.post('/admin/blokirajKupca', checkAdminNotAuthenticated,(req, res, next) => {
  var datum = moment(Date.now()).format('YYYY-MM-DD HH:mm:ss');
  let id = req.body.idK;

  var novi = moment(datum, "YYYY-MM-DD HH:mm:ss").add(15, 'days');
  var noviFormatiran = novi.format('YYYY-MM-DD HH:mm:ss');
  pool.query('update kupac set datum_blok=$1 where id_kupac=$2;', [noviFormatiran,id], (err,result) => {
    if(err) {
      console.log(err);
    }
    res.redirect('/admin/panel');
  })
})

app.post('/admin/urediKupca', checkAdminNotAuthenticated,(req, res, next) => {
  let idK = req.body.urediK;
  console.log(idK);
  pool.query('select * from kupac where id_kupac=$1;', [idK], async (err, result) => {
    if(err) {
      console.log(err);
    }
    let kupac = await result.rows;
    res.render('admin-profil-edit', {kupac: kupac});
  })
})

app.post('/admin/urediK', checkAdminNotAuthenticated,(req, res, next) => {
  let ime      = req.body.ime;
  let prezime  = req.body.prezime;
  let adresa   = req.body.adresa;
  let id       = req.body.idK;

  let err = [];
  if(!ime || !prezime ||  !adresa) {
    err.push({poruka: 'Polja ne smiju biti prazna'});
  }

  if(err.length > 1) {
    alert('Polja ne smiju biti prazna');
  }
  else {
    pool.query('update kupac set ime_kupac=$1, prezime_kupac=$2, adresa_kupac=$3 where id_kupac=$4;', [ime, prezime, adresa, id], (err, result) => {
      if(err) {
        console.log(err);
      }
      console.log('updateovan kupac sa imenom : ' + ime);
      res.redirect('/admin/panel');

    })
  }

});


app.post('/admin/obrisiKupca', checkAdminNotAuthenticated, (req, res, next) => {
  let id = req.body.obrisiK;
  pool.query('delete from kupac where id_kupac=$1', [id], (err, result) => {
    if(err) {
      console.log(err);
    }
    console.log('obrisan kupac sa id : ' + id);
    res.redirect('/admin/panel');
  })
})

// BLOKIRAJ RADNJU
app.post('/admin/blokirajRadnju', checkAdminNotAuthenticated, (req, res, next) => {
  var datum = moment(Date.now()).format('YYYY-MM-DD HH:mm:ss');
  let id = req.body.idRadnje;

  var novi = moment(datum, "YYYY-MM-DD HH:mm:ss").add(15, 'days');
  var noviFormatiran = novi.format('YYYY-MM-DD HH:mm:ss');
  pool.query('update trgovina set datum_blok=$1 where id_trg=$2;', [noviFormatiran,id], (err,result) => {
    if(err) {
      console.log(err);
    }
    console.log('radnja blokirana');
    res.redirect('/admin/panel');
  })


});


//UREDI RADNJU
app.post('/admin/urediRadnju', checkAdminNotAuthenticated, (req, res, next) => {
  let id = req.body.idRadnje;
  pool.query('select * from trgovina where id_trg=$1', [id], async (err, result) => {
    if(err) {
      console.log(err);
    }
    let trgovina = await result.rows;
    res.render('admin-trgovina-edit', {trgovina:trgovina });
  })
})

app.post('/admin/urediR', checkAdminNotAuthenticated, (req, res, next) => {
  let ime      = req.body.ime;
  let telefon  = req.body.telefon;
  let sjediste = req.body.sjediste;
  let idT      = req.body.idT;

  pool.query('update trgovina set naziv_trg=$1, telefon_trg=$2, sjediste_trg=$3 where id_trg=$4', [ime, telefon, sjediste, idT], (err, result) => {
    if(err) {
      console.log(err);
    }
    console.log('updateovana radnja sa imenom: ' + ime);
    res.redirect('/admin/panel');
  })
})

app.post('/admin/obrisiRadnju', checkAdminNotAuthenticated, (req, res, next) => {
  let id = req.body.idRadnje;
  //automatski brisi i artikle radnje
  pool.query('delete from trgovina where id_trg=$1', [id], (err, result) => {
    if(err) {
      console.log(err);
    }
    console.log('obrisana radnja sa id: ' + id);
    pool.query('delete from artikal where id_trg=$1', [id], (err, result) => {
      if(err) {
        console.log(err);
      }
      console.log('obrisan i trgovac i artikli');
      pool.query('delete from narudzba where id_trg=$1', [id], (err, result) => {
        if(err) {
          console.log(err);
        }
        console.log('obrisan trgovac,artikli i narudzbe');
        res.redirect('/admin/panel');
      })

    })

  })
})


app.get('/admin/chatRoom', (req, res, next) => {
  let a = 'adminpanel';
  pool.query('select * from kupac where username_kupac != $1;', [a], async (err, result) => {
    if(err){
      console.log(err);
    }

    let kupci = await result.rows;

    pool.query('select * from trgovina;', async (err, result) => {
      if(err){
        console.log(err);
      }

      let radnje = await result.rows;

      res.render('admin-chat-room', { kupci: kupci, radnje: radnje})

    })

  })
})









//app.js

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
