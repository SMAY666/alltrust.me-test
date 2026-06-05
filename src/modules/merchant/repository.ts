import {MerchantModel} from './model.js';
import {MerchantCreationAttributes} from './types.js';

class MerchantRepository {
    public async getById(id: string) {
        return await MerchantModel.findById(id);
    }

    public async getAll() {
        return await MerchantModel.find();
    }

    public async create(data: MerchantCreationAttributes) {
        // Можно добавить проверку уникальности по полю name
        return await MerchantModel.create(data);
    }
}

export const merchantRepository = new MerchantRepository();
