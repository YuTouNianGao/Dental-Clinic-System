const { db, ensureCollections, getDoc, findOne, add, update, list } = require('./db');
const { hashPassword, makeNo } = require('./security');

function shanghaiDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000 + 8 * 3600000);
  return d.toISOString().slice(0, 10);
}

async function ensureOnly(names) {
  for (const name of names) {
    try { await db.createCollection(name); } catch (error) {}
  }
}

async function seedStaffOnly() {
  await ensureOnly(['users']);
  if (!await findOne('users', { staffUsername: 'admin' })) {
    await add('users', {
      role: 'HQ_MANAGER', staffUsername: 'admin', displayName: '总部管理员',
      passwordHash: hashPassword('Dental@2026'), clinicIds: [], status: 'ACTIVE', staff: true
    });
  }
  if (!await findOne('users', { staffUsername: 'frontdesk' })) {
    await add('users', {
      role: 'FRONT_DESK', staffUsername: 'frontdesk', displayName: '前台小林',
      passwordHash: hashPassword('Dental@2026'), clinicIds: [], status: 'ACTIVE', staff: true
    });
  }
}

async function seedDepartmentsOnly() {
  await ensureOnly(['departments']);
  const departments = [
    { code: 'ENDO', name: '牙体牙髓科', short: '牙体', sort: 1 },
    { code: 'ORTHO', name: '正畸科', short: '正畸', sort: 2 },
    { code: 'PEDO', name: '儿童口腔科', short: '儿牙', sort: 3 },
    { code: 'IMPLANT', name: '种植科', short: '种植', sort: 4 },
    { code: 'GENERAL', name: '综合口腔科', short: '综合', sort: 5 }
  ];
  await Promise.all(departments.map(async (dept) => {
    if (!await findOne('departments', { code: dept.code })) {
      await add('departments', { ...dept, status: 'ACTIVE', createdAt: new Date() });
    }
  }));
}

async function seedCatalogOnly() {
  await ensureOnly(['treatments']);
  if (await findOne('treatments', { name: '洁牙' })) return;
  await add('treatments', { name: '洁牙', category: '预防', priceCents: 28000, status: 'ACTIVE' });
  await add('treatments', { name: '树脂充填', category: '牙体牙髓', priceCents: 38000, status: 'ACTIVE' });
  await add('treatments', { name: '儿童涂氟', category: '儿童口腔', priceCents: 18000, status: 'ACTIVE' });
}

const DEMO_PATIENTS = [
  { name: '林可', phone: '13910001001', gender: 'FEMALE', age: 32, address: '广州市天河区华穗路 18 号' },
  { name: '周宁', phone: '13910001002', gender: 'MALE', age: 38, address: '广州市越秀区东风路 8 号' },
  { name: '陈晨', phone: '13910001003', gender: 'FEMALE', age: 27, address: '广州市海珠区新港中路 12 号' },
  { name: '李思', phone: '13910001004', gender: 'MALE', age: 45, address: '广州市番禺区汉溪大道 66 号' },
  { name: '黄悦', phone: '13910001005', gender: 'FEMALE', age: 19, address: '广州市天河区天河北路 28 号' },
  { name: '吴桐', phone: '13910001006', gender: 'MALE', age: 31, address: '广州市越秀区环市东路 90 号' },
  { name: '郑凯', phone: '13910001007', gender: 'MALE', age: 52, address: '广州市海珠区滨江东路 33 号' },
  { name: '王芳', phone: '13910001008', gender: 'FEMALE', age: 41, address: '广州市番禺区市桥街 18 号' }
];

async function seedPatientsOnly() {
  await ensureOnly(['patients', 'visits', 'settlements']);
  const patientMap = {};
  await Promise.all(DEMO_PATIENTS.map(async (p) => {
    let patient = await findOne('patients', { phone: p.phone });
    if (!patient) {
      patient = await add('patients', {
        patientNo: makeNo('PAT'), name: p.name, phone: p.phone, gender: p.gender, age: p.age,
        billingAddress: p.address, status: 'ACTIVE', createdAt: new Date()
      });
    }
    patientMap[p.phone] = patient;
  }));
  const first = patientMap['13910001001'];
  const second = patientMap['13910001002'];
  if (first && !await findOne('visits', { patientId: first._id })) {
    const visit = await add('visits', {
      visitNo: makeNo('VIS'), appointmentId: '', patientId: first._id, patientName: first.name,
      dentistName: '张明', clinicName: '天河旗舰店', visitDate: shanghaiDate(-30),
      problem: '右下后牙疼痛，冷热刺激敏感。', treatmentName: '树脂充填',
      treatmentAmountCents: 38000, status: 'COMPLETED', createdAt: new Date()
    });
    await add('settlements', {
      settlementNo: makeNo('STL'), visitId: visit._id, patientId: first._id, patientName: first.name,
      totalCents: 38000, status: 'ACTIVE', versionNo: 1, balanceOrderId: null, createdAt: new Date()
    });
  }
  if (second && !await findOne('visits', { patientId: second._id })) {
    const visit = await add('visits', {
      visitNo: makeNo('VIS'), appointmentId: '', patientId: second._id, patientName: second.name,
      dentistName: '李悦', clinicName: '越秀门诊', visitDate: shanghaiDate(-12),
      problem: '儿童窝沟较深，进行预防性处理。', treatmentName: '儿童涂氟',
      treatmentAmountCents: 18000, status: 'COMPLETED', createdAt: new Date()
    });
    await add('settlements', {
      settlementNo: makeNo('STL'), visitId: visit._id, patientId: second._id, patientName: second.name,
      totalCents: 18000, status: 'ACTIVE', versionNo: 1, balanceOrderId: null, createdAt: new Date()
    });
  }
}

const DEMO_CLINICS = [
  { clinicNo: 'ADC-001', name: '天河旗舰店', address: '广州市天河区体育西路 101 号', phone: '020-88880001', depositCents: 10000 },
  { clinicNo: 'ADC-002', name: '越秀门诊', address: '广州市越秀区中山五路 88 号', phone: '020-88880002', depositCents: 10000 },
  { clinicNo: 'ADC-003', name: '海珠口腔中心', address: '广州市海珠区江南大道中 180 号', phone: '020-88880003', depositCents: 8000 },
  { clinicNo: 'ADC-004', name: '番禺万博门诊', address: '广州市番禺区汉溪大道东 366 号', phone: '020-88880004', depositCents: 12000 }
];

const DEMO_DENTISTS = [
  { name: '张明', clinicNo: 'ADC-001', title: '主治医师', depts: ['ENDO', 'IMPLANT', 'GENERAL'], qualificationNames: '牙体牙髓、种植' },
  { name: '王峰', clinicNo: 'ADC-001', title: '副主任医师', depts: ['IMPLANT', 'GENERAL'], qualificationNames: '种植、修复' },
  { name: '赵岚', clinicNo: 'ADC-001', title: '主治医师', depts: ['ENDO', 'GENERAL'], qualificationNames: '显微根管、牙体修复' },
  { name: '周航', clinicNo: 'ADC-001', title: '主治医师', depts: ['ORTHO', 'GENERAL'], qualificationNames: '成人正畸、隐形矫正' },
  { name: '陈雨', clinicNo: 'ADC-001', title: '主治医师', depts: ['PEDO', 'GENERAL'], qualificationNames: '儿童口腔、预防' },
  { name: '孙悦', clinicNo: 'ADC-001', title: '主治医师', depts: ['PEDO', 'GENERAL'], qualificationNames: '儿童早期矫治' },

  { name: '李悦', clinicNo: 'ADC-002', title: '副主任医师', depts: ['ORTHO', 'PEDO', 'GENERAL'], qualificationNames: '正畸、儿童口腔' },
  { name: '高远', clinicNo: 'ADC-002', title: '主治医师', depts: ['ENDO', 'GENERAL'], qualificationNames: '根管治疗、牙体修复' },
  { name: '唐静', clinicNo: 'ADC-002', title: '主治医师', depts: ['PEDO', 'GENERAL'], qualificationNames: '儿童口腔、行为管理' },
  { name: '罗丹', clinicNo: 'ADC-002', title: '主治医师', depts: ['ORTHO', 'GENERAL'], qualificationNames: '青少年正畸' },
  { name: '胡杨', clinicNo: 'ADC-002', title: '主治医师', depts: ['IMPLANT', 'GENERAL'], qualificationNames: '种植修复' },
  { name: '许宁', clinicNo: 'ADC-002', title: '主治医师', depts: ['ENDO', 'GENERAL'], qualificationNames: '显微根管' },

  { name: '郭峰', clinicNo: 'ADC-003', title: '副主任医师', depts: ['ENDO', 'IMPLANT', 'GENERAL'], qualificationNames: '牙体牙髓、种植' },
  { name: '韩雪', clinicNo: 'ADC-003', title: '主治医师', depts: ['PEDO', 'GENERAL'], qualificationNames: '儿童口腔' },
  { name: '梁晨', clinicNo: 'ADC-003', title: '主治医师', depts: ['ORTHO', 'GENERAL'], qualificationNames: '成人正畸' },
  { name: '宋佳', clinicNo: 'ADC-003', title: '主治医师', depts: ['ENDO', 'GENERAL'], qualificationNames: '根管治疗' },
  { name: '邓超', clinicNo: 'ADC-003', title: '主治医师', depts: ['IMPLANT', 'GENERAL'], qualificationNames: '口腔外科、种植' },
  { name: '程琳', clinicNo: 'ADC-003', title: '主治医师', depts: ['PEDO', 'GENERAL'], qualificationNames: '儿童口腔、预防' },

  { name: '林峰', clinicNo: 'ADC-004', title: '副主任医师', depts: ['IMPLANT', 'GENERAL'], qualificationNames: '种植、口腔外科' },
  { name: '叶青', clinicNo: 'ADC-004', title: '主治医师', depts: ['ORTHO', 'GENERAL'], qualificationNames: '正畸、咬合管理' },
  { name: '何静', clinicNo: 'ADC-004', title: '主治医师', depts: ['PEDO', 'GENERAL'], qualificationNames: '儿童口腔' },
  { name: '曹阳', clinicNo: 'ADC-004', title: '主治医师', depts: ['ENDO', 'GENERAL'], qualificationNames: '牙体牙髓' },
  { name: '罗欣', clinicNo: 'ADC-004', title: '主治医师', depts: ['PEDO', 'GENERAL'], qualificationNames: '儿童早期矫治' },
  { name: '蒋涛', clinicNo: 'ADC-004', title: '主治医师', depts: ['GENERAL', 'ORTHO'], qualificationNames: '综合治疗、正畸' }
];

async function seedClinicsOnly() {
  await ensureOnly(['clinics']);
  await Promise.all(DEMO_CLINICS.map(async (info) => {
    const clinic = await findOne('clinics', { clinicNo: info.clinicNo });
    if (!clinic) await add('clinics', { ...info, status: 'ACTIVE' });
  }));
}

async function seedClinicDoctors(clinicId) {
  await ensureOnly(['dentists']);
  const clinic = await getDoc('clinics', clinicId);
  if (!clinic) return [];
  const definitions = DEMO_DENTISTS.filter((d) => d.clinicNo === clinic.clinicNo);
  await Promise.all(definitions.map(async (info) => {
    let dentist = await findOne('dentists', { name: info.name, clinicId: clinic._id });
    if (!dentist) {
      await add('dentists', {
        name: info.name, title: info.title, clinicId: clinic._id,
        departmentIds: info.depts, qualificationNames: info.qualificationNames,
        status: 'ACTIVE', createdAt: new Date()
      });
    } else if (!dentist.departmentIds) {
      await update('dentists', dentist._id, { departmentIds: info.depts, qualificationNames: info.qualificationNames });
    }
  }));
  return definitions;
}

async function seedChairs(clinicId) {
  await ensureOnly(['chairs']);
  const clinic = await getDoc('clinics', clinicId);
  if (!clinic) return [];
  let chairs = await list('chairs', { clinicId, status: 'ACTIVE' }, { orderBy: { field: 'chairNo', direction: 'asc' } });
  if (chairs.length) return chairs;
  await Promise.all([1, 2, 3, 4, 5, 6].map(async (n) => {
    await add('chairs', {
      clinicId, chairNo: `C${n}`, name: `${n} 号牙椅`,
      status: 'ACTIVE', createdAt: new Date()
    });
  }));
  return list('chairs', { clinicId, status: 'ACTIVE' }, { orderBy: { field: 'chairNo', direction: 'asc' } });
}

async function seedDemo() {
  await ensureCollections();
  const meta = await getDoc('meta', 'demo');
  if (meta && meta.seeded) return meta;

  const clinic1 = await add('clinics', {
    clinicNo: 'ADC-001', name: '天河旗舰店', address: '广州市天河区体育西路 101 号',
    phone: '020-88880001', depositCents: 10000, status: 'ACTIVE'
  });
  const clinic2 = await add('clinics', {
    clinicNo: 'ADC-002', name: '越秀门诊', address: '广州市越秀区中山五路 88 号',
    phone: '020-88880002', depositCents: 10000, status: 'ACTIVE'
  });

  const dentist1 = await add('dentists', {
    name: '张明', title: '主治医师', clinicId: clinic1._id,
    departmentIds: ['ENDO', 'IMPLANT', 'GENERAL'], qualificationNames: '牙体牙髓、种植', status: 'ACTIVE'
  });
  const dentist2 = await add('dentists', {
    name: '李悦', title: '副主任医师', clinicId: clinic2._id,
    departmentIds: ['ORTHO', 'PEDO', 'GENERAL'], qualificationNames: '正畸、儿童口腔', status: 'ACTIVE'
  });

  const patient1 = await add('patients', {
    name: '林可', phone: '13910001001', birthDate: '1994-05-20',
    billingAddress: '广州市天河区华穗路 18 号', status: 'ACTIVE'
  });
  const patient2 = await add('patients', {
    name: '周宁', phone: '13910001002', birthDate: '1988-11-02',
    billingAddress: '广州市越秀区东风路 8 号', status: 'ACTIVE'
  });

  await add('users', {
    role: 'HQ_MANAGER', staffUsername: 'admin', displayName: '总部管理员',
    passwordHash: hashPassword('Dental@2026'), clinicIds: [clinic1._id, clinic2._id],
    status: 'ACTIVE', staff: true
  });
  await add('users', {
    role: 'FRONT_DESK', staffUsername: 'frontdesk', displayName: '前台小林',
    passwordHash: hashPassword('Dental@2026'), clinicIds: [clinic1._id],
    status: 'ACTIVE', staff: true
  });

  const schedules = [];
  for (let i = 1; i <= 7; i += 1) {
    const date = shanghaiDate(i);
    schedules.push(await add('schedules', {
      clinicId: clinic1._id, dentistId: dentist1._id, date,
      startMinute: 540, endMinute: 1080, durationMinutes: 30, status: 'PUBLISHED'
    }));
    schedules.push(await add('schedules', {
      clinicId: clinic2._id, dentistId: dentist2._id, date,
      startMinute: 540, endMinute: 1080, durationMinutes: 30, status: 'PUBLISHED'
    }));
  }

  const sampleDate = shanghaiDate(1);
  const sampleAppointment = await add('appointments', {
    appointmentNo: makeNo('APT'), patientId: patient1._id, patientName: patient1.name,
    patientPhone: patient1.phone, dentistId: dentist1._id, dentistName: dentist1.name,
    clinicId: clinic1._id, clinicNo: clinic1.clinicNo, clinicName: clinic1.name,
    departmentId: '', departmentName: '牙体牙髓科',
    scheduleId: schedules[0]._id, date: sampleDate, startMinute: 630, endMinute: 660,
    status: 'SCHEDULED', channel: 'STAFF', depositOrderId: null,
    holdExpiresAt: null, createdAt: new Date()
  });
  const sampleVisit = await add('visits', {
    visitNo: makeNo('VIS'), appointmentId: sampleAppointment._id, patientId: patient1._id,
    patientName: patient1.name, dentistName: dentist1.name, clinicName: clinic1.name,
    visitDate: sampleDate, problem: '右下后牙疼痛，检查后完成充填。',
    treatmentName: '树脂充填', treatmentAmountCents: 28000, status: 'COMPLETED',
    createdAt: new Date()
  });
  const sampleSettlement = await add('settlements', {
    settlementNo: makeNo('STL'), visitId: sampleVisit._id, patientId: patient1._id,
    patientName: patient1.name, totalCents: 28000, status: 'ACTIVE', versionNo: 1,
    balanceOrderId: null, createdAt: new Date()
  });
  await db.collection('meta').doc('demo').set({
    data: { seeded: true, seededAt: new Date(), version: 1 }
  });
  return { seeded: true, clinicId: clinic1._id, patientId: patient1._id, settlementId: sampleSettlement._id };
}

module.exports = {
  seedDemo, seedStaffOnly, seedClinicsOnly, seedClinicDoctors, seedChairs,
  seedPatientsOnly, seedDepartmentsOnly, seedCatalogOnly, ensureOnly, shanghaiDate
};
