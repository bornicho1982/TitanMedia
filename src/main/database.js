const { app } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(app.getPath('userData'), 'titanmedia.db');
let db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Database opening error: ', err);
    } else {
        console.log(`Successfully connected to database at ${dbPath}`);
    }
});

function initialize() {
    db.serialize(() => {
        db.run(`
            CREATE TABLE IF NOT EXISTS scenes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            );
        `);
        db.run(`
            CREATE TABLE IF NOT EXISTS sources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scene_id INTEGER,
                name TEXT NOT NULL,
                type_id TEXT NOT NULL,
                settings TEXT,
                FOREIGN KEY(scene_id) REFERENCES scenes(id)
            );
        `);
        console.log("Database tables initialized.");
    });
}

function saveFullSceneData(sceneData, callback) {
    db.serialize(() => {
        db.run("BEGIN TRANSACTION;");
        db.run("DELETE FROM sources;");
        db.run("DELETE FROM scenes;");

        const sceneStmt = db.prepare("INSERT INTO scenes (name) VALUES (?);");
        const sourceStmt = db.prepare("INSERT INTO sources (scene_id, name, type_id, settings) VALUES (?, ?, ?, ?);");

        sceneData.forEach(scene => {
            sceneStmt.run(scene.name, function(err) {
                if (err) {
                    console.error("Error inserting scene:", err);
                    return;
                }
                const sceneId = this.lastID;
                scene.sources.forEach(source => {
                    sourceStmt.run(sceneId, source.name, source.type_id, source.settings);
                });
            });
        });

        sceneStmt.finalize();
        sourceStmt.finalize();
        db.run("COMMIT;", callback);
    });
}

function getSceneNames(callback) {
    db.all("SELECT name FROM scenes ORDER BY id ASC;", [], callback);
}

function loadFullSceneData(sceneNames, callback) {
     if (sceneNames.length === 0) {
        return callback(null, []);
    }
    const sceneData = [];
    let scenesProcessed = 0;

    db.serialize(() => {
        sceneNames.forEach(sceneName => {
            db.get("SELECT id FROM scenes WHERE name = ?", [sceneName], (err, sceneRow) => {
                if (err) return callback(err);
                if (!sceneRow) return callback(new Error(`Scene not found: ${sceneName}`));

                const sceneId = sceneRow.id;
                db.all("SELECT name, type_id, settings FROM sources WHERE scene_id = ?", [sceneId], (err, sourceRows) => {
                    if (err) return callback(err);

                    sceneData.push({
                        name: sceneName,
                        sources: sourceRows
                    });

                    scenesProcessed++;
                    if (scenesProcessed === sceneNames.length) {
                        callback(null, sceneData);
                    }
                });
            });
        });
    });
}


module.exports = {
    initialize,
    saveFullSceneData,
    getSceneNames,
    loadFullSceneData
};
