const LocalStrategy = require("passport-local").Strategy;

const bcrypt = require('bcrypt');

const pg = require("pg");
const moment = require("moment");
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

function initializeShop(passport) {
    const authenticateShop = (email, password, done) => {
        pool.query(`select * from trgovina where email_trg = $1;`, [email], (err, result) => {
            if(err) {
                throw err;
            }
            //ako je veci od 1, nasao je korisnika
            if(result.rows.length > 0) {
                const shop = result.rows[0];

                var datum_baza = shop.datum_blok;
                console.log(datum_baza);
                var datum = moment(Date.now()).format('YYYY-MM-DD HH:mm:ss');

                bcrypt.compare(password, shop.password, (err, isMatch) => {
                    if(err) {
                        throw err;
                    }
                    //prvi error, drugi korisnik
                    if(isMatch) {
                        if(datum_baza == null) {
                            return done(null, shop);
                        }
                        if(datum_baza !== null) {
                            let isAft = moment(datum).isAfter(datum_baza);
                            if(isAft) {
                                return done(null, shop);
                            }
                            else {
                                return done(null, false, {poruka: "Password nije tacan"});
                            }
                        }
                    }else {
                        return done(null, false, {poruka: "Password nije tacan"});
                    }
                })
            } else {
                return done(null, false, {poruka: "Email nije registrovan."});
            }
        })
    }


    passport.use('passportShop', new LocalStrategy({
        usernameField: 'email',
        passwordField: 'password'
    }, authenticateShop));


    passport.serializeUser((shop, done) => done(null,shop.id_trg));

    passport.deserializeUser((id, done) => {
        pool.query(`select * from trgovina where id_trg= $1`, [id], (err, result) => {
            if(err) {
                throw err;
            }
            return done(null, result.rows[0]);
        })
    });


}

module.exports = initializeShop;