import {cleanEnv, num, str} from 'envalid';


export const ENV = cleanEnv(Object.assign({}, process.env), {
    HOST: str(),
    PORT: num({default: 8001}),

    MONGO_URL: str(),
    REDIS_URL: str(),
});
