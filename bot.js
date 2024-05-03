const mineflayer = require('mineflayer');
const Movements = require('mineflayer-pathfinder').Movements;
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { GoalBlock, GoalXZ } = require('mineflayer-pathfinder').goals;
const axios = require('axios');
const readline = require('readline');
const config = require('./settings.json');
const loggers = require('./logging.js');
const logger = loggers.logger;
const fs = require('fs');
const path = require('path');
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

   function updateTotalLogsCount() {
    const logsFilePath = path.join(__dirname, 'public/logs', 'logs.txt');
    const totalFilePath = path.join(__dirname, 'public/logs', 'total.txt');

    fs.readFile(logsFilePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading logs file:', err);
            return;
        }

        const logsCount = data.trim().split('\n').length;

        fs.writeFile(totalFilePath, logsCount.toString(), (err) => {
            if (err) {
                console.error('Error updating total logs count:', err);
                return;
            }
        });
    });
}

function sendChatMessage(bot, message) {
    bot.chat(message);
}

function createBot() {
    const bot = mineflayer.createBot({
        username: config['bot-account']['username'],
        password: config['bot-account']['password'],
        auth: config['bot-account']['type'],
        host: config.server.ip,
        port: config.server.port,
        version: config.server.version,
    });
    bot.loadPlugin(pathfinder);
    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);
    bot.settings.colorsEnabled = false;
    bot.pathfinder.setMovements(defaultMove);

    const playersFilePath = 'D:\\website_for_bot\\logs\\players.txt';
    let onlinePlayers = [];

    function trackOnlinePlayers(bot) {
        const timestamp = new Date().toLocaleString();
        const players = Object.keys(bot.players).map(playerName => bot.players[playerName].username);
        const onlinePlayersMessage = `${timestamp}: Online players(${players.length}): ${players.join(', ')}\n`;
        onlinePlayers = players;

        fs.appendFile(playersFilePath, onlinePlayersMessage, (err) => {
            if (err) {
                console.error('Error saving online players to file:', err);
            }
        });
    }

    let socket;

    io.on('connection', (s) => {
        socket = s;
    });

    function sendOutputToClient(output) {
        if (socket) {
            socket.emit('output', output);
        }
    }
    
    function sendChatMessageAndOutput(bot, message) {
        sendChatMessage(bot, message);
        console.log(`Message sent in Minecraft: ${message}`);
        sendOutputToClient(message);
    }

    rl.on('line', (input) => {
        if (input === '!coords') {
            const coordsMessage = `Bot's current position: ${bot.entity.position}`;
            console.log(coordsMessage);
            sendOutputToClient(coordsMessage);
        } else if (input === '!players') {
            const players = Object.keys(bot.players).map(playerName => bot.players[playerName].username);
            const onlinePlayersMessage = `Online players: ${players.join(', ')}`;
            console.log(onlinePlayersMessage);
            sendOutputToClient(onlinePlayersMessage);
        } else if (input === '!help') {
            const message = 'commands are !players !coords !track';
            console.log(message);
            sendOutputToClient(message);
        } else if (input === '!track') {
            console.log('Tracking started...');
            sendOutputToClient('Tracking started...');
            trackOnlinePlayers(bot);
            setInterval(() => {
                trackOnlinePlayers(bot);
            }, 10 * 60 * 1000);
        } else {
            sendChatMessageAndOutput(bot, input);
        }
    });

    bot.once('spawn', () => {
        const connectedMessage = `Bot connected to ${config.server.ip}`;
        logger.info(connectedMessage);
        sendOutputToClient(connectedMessage);

        if (config.utils['auto-auth'].enabled) {
            let password = config.utils['auto-auth'].password;
            setTimeout(() => {
                bot.chat(`/register ${password} ${password}`);
                bot.chat(`/login ${password}`);
            }, 500);
        }

        if (config.utils['chat-messages'].enabled) {
            let messages = config.utils['chat-messages']['messages'];

            if (config.utils['chat-messages'].repeat) {
                let delay = config.utils['chat-messages']['repeat-delay'];
                let i = 0;

                setInterval(() => {
                    bot.chat(`${messages[i]}`);

                    if (i + 1 === messages.length) {
                        i = 0;
                    } else i++;
                }, delay * 1000);
            } else {
                messages.forEach((msg) => {
                    bot.chat(msg);
                });
            }
        }

        const pos = config.position;

        if (config.position.enabled) {
            logger.info(
                `Bot started moving to targeted location (${pos.x}, ${pos.y}, ${pos.z})`
            );
            bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
        }

        if (config.utils['anti-afk'].enabled) {
            if (config.utils['anti-afk'].sneak) {
                bot.setControlState('sneak', true);
            }

            if (config.utils['anti-afk'].jump) {
                bot.setControlState('jump', true);
            }

            if (config.utils['anti-afk']['hit'].enabled) {
                let delay = config.utils['anti-afk']['hit']['delay'];
                let attackMobs = config.utils['anti-afk']['hit']['attack-mobs']

                setInterval(() => {
                    if (attackMobs) {
                        let entity = bot.nearestEntity(e => e.type !== 'object' && e.type !== 'player' &&
                            e.type !== 'global' && e.type !== 'orb' && e.type !== 'other');

                        if (entity) {
                            bot.attack(entity);
                            return
                        }
                    }

                    bot.swingArm("right", true);
                }, delay);
            }

            if (config.utils['anti-afk'].rotate) {
                setInterval(() => {
                    bot.look(bot.entity.yaw + 1, bot.entity.pitch, true);
                }, 100);
            }

            if (config.utils['anti-afk']['circle-walk'].enabled) {
                let radius = config.utils['anti-afk']['circle-walk']['radius']
                circleWalk(bot, radius);
            }
        }
    });

    bot.on('chat', (username, message) => {
        const ignoredUsernames = ['Server'];
        if (ignoredUsernames.includes(username)) {
            console.log(`Blacklisted person (${username}) has sent a message: ${message}`);
            return;
        }

        if (message.includes('popiiumaa')) {
            const timestamp = new Date().toLocaleString();
            const logMessage = `[${timestamp}] ${username}: ${message}`;
            const filename = '/home/container/public/logs/mentioned.txt';

            fs.appendFile(filename, logMessage + '\n', (err) => {
                if (err) {
                    console.error('Error saving chat message to file:', err);
                } else {
                    console.log(`Popiiumaa mentioned`);
                }
            });
        }

        if (config.utils['chat-log']) {
            const timestamp = new Date().toLocaleString();
            const logMessage = `[${timestamp}] ${username}: ${message}`;
            logger.info(logMessage);

            fs.appendFile('/home/container/public/logs/logs.txt', logMessage + '\n', (err) => {
                if (err) {
                    console.error('Error saving chat message to file:', err);
                }
            });
        }
    });

    bot.on('goal_reached', () => {
        if (config.position.enabled) {
            logger.info(
                `Bot arrived at targeted location. ${bot.entity.position}`
            );
        }
    });

    bot.on('death', () => {
        const deathMessage = "Bot has died and was respawned at " + bot.entity.position;
        logger.warn(deathMessage);
    });

    bot.on('end', () => {
        setTimeout(() => {
            createBot();
        }, 120000);
    });

    bot.on('kicked', (reason) => {
        let reasonText = JSON.parse(reason).text || (JSON.parse(reason).extra[0] && JSON.parse(reason).extra[0].text);
        reasonText = reasonText.replace(/§./g, '');
        const kickedMessage = `Bot was kicked from the server. Reason: ${reasonText}`;
        logger.warn(kickedMessage);
    });
    bot.on('error', (err) => {
        const errorMessage = err.message;
        logger.error(errorMessage);
    });

    setupSocketIO(bot);
}

function circleWalk(bot, radius) {
    const pos = bot.entity.position;
    const x = pos.x;
    const y = pos.y;
    const z = pos.z;

    const points = [
        [x + radius, y, z],
        [x, y, z + radius],
        [x - radius, y, z],
        [x, y, z - radius],
    ];

    let i = 0;
    setInterval(() => {
        if (i === points.length) i = 0;
        bot.pathfinder.setGoal(new GoalXZ(points[i][0], points[i][2]));
        i++;
    }, 1000);
}

setInterval(updateTotalLogsCount, 5000);

function setupSocketIO(bot) {
    io.on('connection', (socket) => {
        bot.on('chat', (username, message) => {
            socket.emit('chat message', { username, message });
        });

        socket.on('command', (cmd) => {
            console.log('Received command:', cmd);
            rl.emit('line', cmd);
        });

        socket.on('disconnect', () => {
            console.log('');
        });
    });
}
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/websitehtml', 'index.html'));
});

app.get('/About', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/websitehtml', 'newabout.html'));
});

app.get('/Logs', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/logs', 'logs.txt'));
});

app.get('/Filter-Logs', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/websitehtml', 'newsearchlogs.html'));
});

app.get('/Popiiumaa', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/logs', 'mentioned.txt'));
});

app.get('/secretmessageplace', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/websitehtml', 'reimosecretmessageplace.html'));
});

app.get('/logger', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/websitehtml', 'index1.html'));
});

app.get('/info', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/websitehtml', 'idk.html'));
});

app.get('/sus', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/websitehtml', 'sus.html'));
});

// Define a fallback route for 404 errors
app.use((req, res, next) => {
    res.status(404).send("Sorry, that route doesn't exist.");
});

// Start the server
http.listen(3000, '0.0.0.0', () => {
    console.log('Web server listening on craftchat.duckdns.org:21659');
});

createBot();
