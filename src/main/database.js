const sqlite3 = require('sqlite3').verbose();
const { app } = require('electron');
const path = require('path');

const dbPath = path.join(app.getPath('userData'), 'titanmedia.db');
let db = null;

function connect() {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Could not connect to database', err);
                reject(err);
            } else {
                console.log('Connected to database');
                resolve();
            }
        });
    });
}

function initialize() {
    return new Promise((resolve, reject) => {
        const createScenesTable = `
            CREATE TABLE IF NOT EXISTS scenes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            );
        `;
        const createSourcesTable = `
            CREATE TABLE IF NOT EXISTS sources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scene_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                type_id TEXT NOT NULL,
                settings TEXT,
                FOREIGN KEY (scene_id) REFERENCES scenes (id) ON DELETE CASCADE
            );
        `;

        db.serialize(() => {
            db.run(createScenesTable, (err) => {
                if (err) return reject(err);
            });
            db.run(createSourcesTable, (err) => {
                if (err) return reject(err);
                console.log('Database tables checked/created.');
                resolve();
            });
        });
    });
}

function close() {
    return new Promise((resolve, reject) => {
        if (db) {
            db.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log('Database connection closed.');
                    resolve();
                }
            });
        } else {
            resolve();
        }
    });
}

async function saveSceneCollection(scenes) {
    return new Promise((resolve, reject) => {
        if (!db) return reject("Database not connected.");

        db.serialize(() => {
            // Start a transaction for performance and safety
            db.run("BEGIN TRANSACTION;");

            // Clear old data
            db.run("DELETE FROM sources;");
            db.run("DELETE FROM scenes;");

            const sceneStmt = db.prepare("INSERT INTO scenes (name) VALUES (?);");
            const sourceStmt = db.prepare("INSERT INTO sources (scene_id, name, type_id, settings) VALUES (?, ?, ?, ?);");

            scenes.forEach(scene => {
                sceneStmt.run(scene.name, function(err) {
                    if (err) return reject(err);

                    const sceneId = this.lastID; // Get the ID of the scene we just inserted
                    scene.sources.forEach(source => {
                        sourceStmt.run(sceneId, source.name, source.type_id, source.settings);
                    });
                });
            });

            sceneStmt.finalize((err) => { if(err) reject(err); });
            sourceStmt.finalize((err) => { if(err) reject(err); });

            db.run("COMMIT;", (err) => {
                if (err) {
                    console.error("Commit failed", err);
                    reject(err);
                } else {
                    console.log('Scene collection saved to database.');
                    resolve();
                }
            });
        });
    });
}

function loadSceneCollection() {
    return new Promise((resolve, reject) => {
        if (!db) return reject("Database not connected.");

        const scenes = [];
        const sceneQuery = "SELECT id, name FROM scenes ORDER BY id;";

        db.all(sceneQuery, [], (err, sceneRows) => {
            if (err) return reject(err);

            if (sceneRows.length === 0) {
                return resolve([]); // No scenes saved, return empty array
            }

            let scenesProcessed = 0;
            sceneRows.forEach(sceneRow => {
                const scene = {
                    id: sceneRow.id,
                    name: sceneRow.name,
                    sources: []
                };

                const sourceQuery = "SELECT name, type_id, settings FROM sources WHERE scene_id = ?;";
                db.all(sourceQuery, [scene.id], (err, sourceRows) => {
                    if (err) return reject(err);

                    sourceRows.forEach(sourceRow => {
                        scene.sources.push({
                            name: sourceRow.name,
                            type_id: sourceRow.type_id,
                            settings: sourceRow.settings,
                        });
                    });

                    scenes.push(scene);
                    scenesProcessed++;

                    if (scenesProcessed === sceneRows.length) {
                        // Sort scenes by original ID to maintain order
                        scenes.sort((a, b) => a.id - b.id);
                        console.log("Scene collection loaded from database.");
                        resolve(scenes.map(({id, ...rest}) => rest)); // Remove temporary id
                    }
                });
            });
        });
    });
}


module.exports = {
    connect,
    initialize,
    close,
    saveSceneCollection,
    loadSceneCollection,
};
