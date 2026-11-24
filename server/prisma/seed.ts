import { PrismaClient, Prisma } from '@prisma/client';
import { hashPassword } from '../src/auth';

const prisma = new PrismaClient();

const hsnSeed = [
  { code: '12019000', description: 'Soyabeen', gstRate: '5.00' },
  { code: '10059000', description: 'Makka', gstRate: '0.00' },
  { code: '10019910', description: 'Wheat', gstRate: '0.00' },
  { code: '10063010', description: 'Rice', gstRate: '5.00' },
  { code: '12075090', description: 'Mustard', gstRate: '5.00' },
];

async function main() {
  const passwordHash = await hashPassword('Admin@123');
  await prisma.$transaction(async (tx) => {
    const company = await tx.company.upsert({
      where: { id: 1 },
      update: {},
      create: {
        legalName: 'Abhishek Traders',
        tradeName: 'Abhishek Traders',
        gstin: '23AXQPJ6375E1Z9',
        pan: 'AXQPJ6375E',
        address: 'पशु चिकित्सालय के सामने, मायू वेल्डिंग के बाजू में विदिशा रोड़, राहतगढ़',
        city: 'Rahatgarh',
        pincode: '470119',
        stateName: 'Madhya Pradesh',
        stateCode: '23',
        phone: '8269129464',
        bankName: 'Central Bank of India',
        accountNo: '3803390687',
        ifsc: 'CBIN0281891',
        branch: 'Rahatgarh',
        gstEnv: 'SANDBOX',
      },
    });
    for (const name of ['SUPER_ADMIN', 'ADMIN', 'OPERATOR']) {
      await tx.role.upsert({ where: { name }, update: {}, create: { name } });
    }
    const role = await tx.role.findUniqueOrThrow({ where: { name: 'SUPER_ADMIN' } });
    const user = await tx.user.upsert({
      where: { username: 'admin' },
      update: { passwordHash, active: true, companyId: company.id },
      create: { companyId: company.id, fullName: 'Abhishek', username: 'admin', passwordHash },
    });
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
    for (const row of hsnSeed) {
      await tx.hsnCode.upsert({
        where: { companyId_code: { companyId: company.id, code: row.code } },
        update: { description: row.description, gstRate: new Prisma.Decimal(row.gstRate) },
        create: { companyId: company.id, code: row.code, description: row.description, gstRate: new Prisma.Decimal(row.gstRate) },
      });
    }
    const soyabeen = await tx.hsnCode.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: '12019000' } } });
    const makka = await tx.hsnCode.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code: '10059000' } } });
    const existingProducts = await tx.product.count({ where: { companyId: company.id } });
    if (existingProducts === 0) {
      await tx.product.createMany({
        data: [
          { companyId: company.id, name: 'Soyabeen', unit: 'QTL', hsnId: soyabeen.id, gstRate: soyabeen.gstRate },
          { companyId: company.id, name: 'Makka', unit: 'QTL', hsnId: makka.id, gstRate: makka.gstRate },
        ],
      });
    }
    const existingCustomer = await tx.customer.findFirst({ where: { companyId: company.id, gstin: '23CDGPR7584H1Z3' } });
    if (!existingCustomer) {
      await tx.customer.create({
        data: {
          companyId: company.id,
          name: 'KESHAR ENTERPRISE',
          address: '1 new galla mandi, Basoda',
          city: 'Vidisha',
          pincode: '464221',
          gstin: '23CDGPR7584H1Z3',
          stateName: 'Madhya Pradesh',
          stateCode: '23',
        },
      });
    }
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
