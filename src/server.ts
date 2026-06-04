import express from 'express';
import {ENV} from './constants/env.js';

const app = express();
const PORT = ENV.PORT;


export function start() {
    app.listen(PORT, () => {
        console.log(`Server is running on ${ENV.HOST}:${PORT}`);
    });
}
