const express = require('express');
const app = express();
const fs = require('node:fs/promises');
const formidable = require('express-formidable');
const { MongoClient, ObjectId } = require("mongodb");
const session = require('express-session');
const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;


app.use(session({
    secret: "MediaCloudSecretKey", 
    resave: true,
    saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());


const facebookAuth = {
    'clientID': '902102522477336', 
    'clientSecret': '267a3fdc14c82f38f5b45ed333cc95ef', 
    'callbackURL': 'https://comp3810sef-group61.onrender.com/auth/facebook/callback'
};


passport.serializeUser(function (user, done) {
    done(null, user);
});

passport.deserializeUser(function (obj, done) {
    done(null, obj);
});

passport.use(new FacebookStrategy({
    clientID: facebookAuth.clientID,
    clientSecret: facebookAuth.clientSecret,
    callbackURL: facebookAuth.callbackURL,
    profileFields: ['id', 'displayName', 'photos'] 
}, function (token, refreshToken, profile, done) {
    // 构建用户对象
    const user = {
        id: profile.id,
        name: profile.displayName,
        photo: profile.photos ? profile.photos[0].value : null, 
        type: 'facebook'
    };
    return done(null, user);
}));


app.set('view engine', 'ejs');
app.use('/public', express.static('public'));


app.use((req, res, next) => {
    res.locals.user = req.user || null;
    next();
});


app.use(formidable());


const mongourl = 'mongodb+srv://heying:fjk12380@cluster0.zrabk1y.mongodb.net/media_cloud?retryWrites=true&w=majority';
const client = new MongoClient(mongourl);
const dbName = 'media_cloud';
const collectionName = "media_files";

const getDB = async () => {
    if (!client.topology || !client.topology.isConnected()) {
        await client.connect();
    }
    return client.db(dbName);
};

app.get('/api/files', async (req, res) => {
    const db = await getDB();
    const query = {};
    
    if (req.query.filename) {
        query.filename = { $regex: req.query.filename, $options: 'i' };
    }
    const docs = await db.collection(collectionName).find(query).toArray();
    res.status(200).json(docs);
});

app.post('/api/files', async (req, res) => {
    const db = await getDB();
    try {
        const newDoc = {
            filename: req.fields.filename || 'Untitled',
            description: req.fields.description || '',
            createdAt: new Date()
        };
        const result = await db.collection(collectionName).insertOne(newDoc);
        res.status(201).json({ message: 'Created', id: result.insertedId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/files/:id', async (req, res) => {
    const db = await getDB();
    try {
        const { id } = req.params;
        const updateData = {
            $set: {
                filename: req.fields.filename,
                description: req.fields.description,
                updatedAt: new Date()
            }
        };
        const result = await db.collection(collectionName).updateOne(
            { _id: new ObjectId(id) },
            updateData
        );
        res.status(200).json({ message: 'Updated', modified: result.modifiedCount });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/files/:id', async (req, res) => {
    const db = await getDB();
    try {
        const { id } = req.params;
        const result = await db.collection(collectionName).deleteOne({ _id: new ObjectId(id) });
        res.status(200).json({ message: 'Deleted', deleted: result.deletedCount });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

app.get("/auth/facebook", passport.authenticate("facebook"));

app.get("/auth/facebook/callback",
    passport.authenticate("facebook", { 
        failureRedirect: "/login"
    }),
    function(req, res) {
        // Successful authentication
        res.redirect("/list");
    }
);

app.get("/logout", (req, res, next) => {
    req.logout(function(err) {
        if (err) { return next(err); }
        res.redirect('/login'); 
    });
});

app.get('/login', (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/list');
    }
    res.render('login');
});

app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        res.redirect('/list');
    } else {
        res.redirect('/login');
    }
});

app.get('/list', isLoggedIn, async (req, res) => {
    const db = await getDB();
    const docs = await db.collection(collectionName).find({}).toArray();
    res.render('list', { files: docs });
});

app.get('/create', isLoggedIn, (req, res) => {
    res.render('create');
});

app.post('/create', isLoggedIn, async (req, res) => {
    const db = await getDB();
    let newDoc = {
        filename: req.fields.filename || 'Notdefine',
        description: req.fields.description || '',
        uploadedAt: new Date(),
        uploader: req.user.name 
    };

    if (req.files.filetoupload && req.files.filetoupload.size > 0) {
        const data = await fs.readFile(req.files.filetoupload.path);
        const ext = req.files.filetoupload.name.split('.').pop().toLowerCase();
        newDoc.mimetype = (ext === 'mp3') ? 'audio/mpeg' : (ext === 'mp4' ? 'video/mp4' : 'application/octet-stream');
        newDoc.file = Buffer.from(data).toString('base64');
    }

    await db.collection(collectionName).insertOne(newDoc);
    res.redirect('/list');
});


app.get('/details', isLoggedIn, async (req, res) => {
    const db = await getDB();
    try {
        const doc = await db.collection(collectionName).findOne({ _id: new ObjectId(req.query._id) });
        doc ? res.render('details', { file: doc }) : res.render('info', { message: 'File not found' });
    } catch (e) {
        res.render('info', { message: 'Invalid ID' });
    }
});

app.get('/edit', isLoggedIn, async (req, res) => {
    const db = await getDB();
    try {
        const doc = await db.collection(collectionName).findOne({ _id: new ObjectId(req.query._id) });
        doc ? res.render('edit', { file: doc }) : res.render('info', { message: 'File not found' });
    } catch (e) {
        res.render('info', { message: 'Invalid ID' });
    }
});

app.post('/update', isLoggedIn, async (req, res) => {
    const db = await getDB();
    const updateDoc = {
        filename: req.fields.filename,
        description: req.fields.description,
        updatedAt: new Date()
    };

    if (req.files.filetoupload && req.files.filetoupload.size > 0) {
        const data = await fs.readFile(req.files.filetoupload.path);
        const ext = req.files.filetoupload.name.split('.').pop().toLowerCase();
        updateDoc.mimetype = (ext === 'mp3') ? 'audio/mpeg' : 'video/mp4';
        updateDoc.file = Buffer.from(data).toString('base64');
    }

    try {
        await db.collection(collectionName).updateOne({ _id: new ObjectId(req.fields._id) }, { $set: updateDoc });
        res.redirect(`/details?_id=${req.fields._id}`);
    } catch (e) {
        res.render('info', { message: 'Update failed' });
    }
});

app.get('/delete', isLoggedIn, async (req, res) => {
    const db = await getDB();
    try {
        const doc = await db.collection(collectionName).findOne({ _id: new ObjectId(req.query._id) });
        doc ? res.render('delete', { file: doc }) : res.render('info', { message: 'File not found' });
    } catch (e) {
        res.render('info', { message: 'Invalid ID' });
    }
});

app.post('/delete', isLoggedIn, async (req, res) => {
    const db = await getDB();
    try {
        await db.collection(collectionName).deleteOne({ _id: new ObjectId(req.fields._id) });
        res.redirect('/list');
    } catch (e) {
        res.render('info', { message: 'Delete failed' });
    }
});

app.get(/(.*)/, (req, res) => {
    res.redirect('/');
});


const port = process.env.PORT || 8099;
app.listen(port, () => console.log(`Server running at http://localhost:${port}`));












