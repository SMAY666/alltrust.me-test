export type MerchantAttributes = {
    id: string,
    name: string,
    feePercent: number,
    createdAt: Date,
    updatedAt: Date,
}

export type MerchantCreationAttributes = Omit<MerchantAttributes, 'id' | '_id' | 'createdAt' | 'updatedAt'>;
