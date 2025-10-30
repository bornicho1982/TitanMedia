
const { app } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

let db = null;

async function openDb() {
    if (db) return db;

    const dbPath = path.join(app.getPath('userData'), 'titanmedia.db');
    console.log(`Database path: ${dbPath}`);

    db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    await setupDb();
    return db;
}

async function setupDb() {
    console.log('Setting up database...');
    await db.exec(`
        CREATE TABLE IF NOT EXISTS app_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    `);
    console.log('Database setup complete.');
}

async function saveState(state) {
    const db = await openDb();
    const jsonState = JSON.stringify(state);
    await db.run(
        "INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)",
        'full_scene_collection',
        jsonState
    );
    console.log('Application state saved.');
}

async function loadState() {
    const db = await openDb();
    const result = await db.get("SELECT value FROM app_state WHERE key = ?", 'full_scene_collection');

    if (result) {
        console.log('Application state loaded.');
        return JSON.parse(result.value);
    }

    console.log('No saved state found.');
    return null;
}

module.exports = {
    openDb,
    saveState,
    loadState
};
