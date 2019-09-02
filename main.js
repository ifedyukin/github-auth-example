const axios = require('axios');
const express = require('express');
const bodyParser = require('body-parser');
const { URLSearchParams } = require('url');

const { PORT = 8080, APP_ID, CLIENT_ID, CLIENT_SECRET, HOST, REDIRECT_URI, CI_PROVIDER } = process.env;

// Можно юзать веб-хуки - https://developer.github.com/webhooks/
// Для работы добавлени коллабораторов служебный аккаунт должен быть добавлен в репозиторий

const app = express();
app.use(bodyParser.json());

let $token = null;
let $repos = [];

app.get('/api/github/auth', async (req, res) => {
    const authUri = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&state=${getStateHash()}&allow_signup=true&scope=repo`;
    res.redirect(authUri);
});

app.get('/api/github/callback', async (req, res) => {
    const { code, state } = req.query;
    const tokenResponse = await axios.post(
        'https://github.com/login/oauth/access_token',
        `client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&code=${code}&redirect_uri=${REDIRECT_URI}&state=${state}`
    );
    $token = `token ${new URLSearchParams(tokenResponse.data).get('access_token')}`;
    res.redirect('/card');
});

app.get('/api/github/add-collaborator', async (req, res) => {
    const { collaborator, repo } = req.query;
    const foundRepo = $repos.find(({ name }) => name === repo);
    const response = await axios({
        method: 'put',
        url: `https://api.github.com/repos/${foundRepo.owner.login}/${foundRepo.name}/collaborators/${collaborator}?permission=pull`,
        headers: { Authorization: `token ${CI_PROVIDER}` }
    });
    res.send('ok');
});

app.get('/card', async (req, res) => {
    const { data: { location, company, login, avatar_url: avatar, repos_url: repos }} = await axios.get(
        'https://api.github.com/user',
        { headers: { Authorization: $token } }
    );

    const { data: reposList } = await axios.get(
        repos,
        { headers: { Authorization: $token } }
    );
    $repos = reposList;

    const options = $repos
        .filter(({ name }) => isNaN(+name[0]))
        .map(({ name }) => `<option>${name}</option>\n`);

    const submitScript = `(function(){
        const repo = document.getElementById('repo');
        const collaborator = document.getElementById('collaborator');
        fetch('/api/github/add-collaborator?repo=' + repo.value + '&collaborator=' + collaborator.value)
            .then(() => {
                alert('Success!');
                repo.value = '';
                collaborator.value = '';
            });
    }())`;

    res.send(`
        <div style="
            width: 200px;
            display: flex;
            flex-direction: column;
            align-items: center;
            margin: auto;
            border: 1px solid;
            padding: 20px;
            border-radius: 10px;
        ">
            <h2>${login}</h2>
            <h3>${company}, ${location}</h3>
            <img width="180px" src=${avatar} />
            <h3>Repos</h3>
            <select id="repo">${options}</select>
            <input style="margin: 10px" type="text" id="collaborator" />
            <button onClick="${submitScript}">Add collaborator</button>
        </div>
    `);
});

app.get('/', async (req, res) => {
    res.send(`
        <button onClick="window.location.assign('/api/github/auth')">Authorize</button>
    `);
});

app.listen(PORT, () => console.log(`Express server is listening on ${PORT}`));

function getStateHash() {
    const date = new Date().getTime()
    const salt = Math.round(Math.random() * 100);
    return `${salt}_${date}`;
}
