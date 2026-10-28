var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// wechat-miniprogram/cloudfunctions/api/lib/db.js
var require_db = __commonJS({
  "wechat-miniprogram/cloudfunctions/api/lib/db.js"(exports2, module2) {
    var cloud2 = require("wx-server-sdk");
    cloud2.init({ env: cloud2.DYNAMIC_CURRENT_ENV });
    var db = cloud2.database();
    var _ = db.command;
    var COLLECTIONS = [
      "meta",
      "clinics",
      "departments",
      "dentists",
      "chairs",
      "schedules",
      "patients",
      "treatments",
      "users",
      "sessions",
      "appointments",
      "appointment_changes",
      "payment_orders",
      "payment_transactions",
      "refunds",
      "visits",
      "settlements",
      "notifications",
      "deposit_applications",
      "staff_requests",
      "binding_requests"
    ];
    async function ensureCollections(names = COLLECTIONS) {
      await Promise.all((names || COLLECTIONS).map(async (name) => {
        try {
          await db.createCollection(name);
        } catch (error) {
          if (![-501001, -502005].includes(Number(error.errCode))) {
            console.warn("createCollection", name, error.errCode, error.errMsg);
          }
        }
      }));
    }
    function dbNow() {
      return /* @__PURE__ */ new Date();
    }
    async function getDoc(collection, id) {
      if (!id)
        return null;
      try {
        const res = await db.collection(collection).doc(String(id)).get();
        return res.data || null;
      } catch (error) {
        if (String(error.errMsg || "").includes("not exist"))
          return null;
        return null;
      }
    }
    async function findOne(collection, where) {
      const res = await db.collection(collection).where(where).limit(1).get();
      return res.data[0] || null;
    }
    async function add(collection, data) {
      const res = await db.collection(collection).add({ data });
      return { _id: res._id, ...data };
    }
    async function update(collection, id, data) {
      return db.collection(collection).doc(String(id)).update({ data });
    }
    async function remove(collection, id) {
      return db.collection(collection).doc(String(id)).remove();
    }
    async function list(collection, where = {}, options = {}) {
      let query = db.collection(collection);
      if (where && Object.keys(where).length)
        query = query.where(where);
      if (options.orderBy)
        query = query.orderBy(options.orderBy.field, options.orderBy.direction || "asc");
      if (options.limit)
        query = query.limit(options.limit);
      const res = await query.get();
      return res.data;
    }
    function ok2(data) {
      return { ok: true, data };
    }
    function fail2(code, message, details) {
      return { ok: false, code, message, details: details || null };
    }
    module2.exports = {
      cloud: cloud2,
      db,
      _,
      COLLECTIONS,
      ensureCollections,
      dbNow,
      getDoc,
      findOne,
      add,
      update,
      remove,
      list,
      ok: ok2,
      fail: fail2
    };
  }
});

// wechat-miniprogram/cloudfunctions/api/lib/security.js
var require_security = __commonJS({
  "wechat-miniprogram/cloudfunctions/api/lib/security.js"(exports2, module2) {
    var crypto = require("crypto");
    function hashPassword(password) {
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = crypto.scryptSync(String(password), salt, 32).toString("hex");
      return `${salt}:${hash}`;
    }
    function verifyPassword(password, stored) {
      if (!stored || !stored.includes(":"))
        return false;
      const [salt, expected] = stored.split(":");
      const actual = crypto.scryptSync(String(password), salt, 32).toString("hex");
      const a = Buffer.from(actual, "hex");
      const b = Buffer.from(expected, "hex");
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    }
    function randomToken() {
      return crypto.randomBytes(32).toString("hex");
    }
    function makeNo(prefix) {
      const d = /* @__PURE__ */ new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const date = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
      return `${prefix}-${date}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    }
    function cents(value) {
      const n = Number(value);
      if (!Number.isFinite(n))
        return 0;
      return Math.round(n * 100);
    }
    function yuan(centsValue) {
      return (Number(centsValue || 0) / 100).toFixed(2);
    }
    module2.exports = { hashPassword, verifyPassword, randomToken, makeNo, cents, yuan };
  }
});

// wechat-miniprogram/cloudfunctions/api/lib/seed.js
var require_seed = __commonJS({
  "wechat-miniprogram/cloudfunctions/api/lib/seed.js"(exports2, module2) {
    var { db, ensureCollections, getDoc, findOne, add, update, list } = require_db();
    var { hashPassword, makeNo } = require_security();
    function shanghaiDate(offsetDays = 0) {
      const d = new Date(Date.now() + offsetDays * 864e5 + 8 * 36e5);
      return d.toISOString().slice(0, 10);
    }
    async function ensureOnly(names) {
      for (const name of names) {
        try {
          await db.createCollection(name);
        } catch (error) {
        }
      }
    }
    async function seedStaffOnly() {
      await ensureOnly(["users"]);
      if (!await findOne("users", { staffUsername: "admin" })) {
        await add("users", {
          role: "HQ_MANAGER",
          staffUsername: "admin",
          displayName: "\u603B\u90E8\u7BA1\u7406\u5458",
          passwordHash: hashPassword("Dental@2026"),
          clinicIds: [],
          status: "ACTIVE",
          staff: true
        });
      }
      if (!await findOne("users", { staffUsername: "frontdesk" })) {
        await add("users", {
          role: "FRONT_DESK",
          staffUsername: "frontdesk",
          displayName: "\u524D\u53F0\u5C0F\u6797",
          passwordHash: hashPassword("Dental@2026"),
          clinicIds: [],
          status: "ACTIVE",
          staff: true
        });
      }
    }
    async function seedDepartmentsOnly() {
      await ensureOnly(["departments"]);
      const departments = [
        { code: "ENDO", name: "\u7259\u4F53\u7259\u9AD3\u79D1", short: "\u7259\u4F53", sort: 1 },
        { code: "ORTHO", name: "\u6B63\u7578\u79D1", short: "\u6B63\u7578", sort: 2 },
        { code: "PEDO", name: "\u513F\u7AE5\u53E3\u8154\u79D1", short: "\u513F\u7259", sort: 3 },
        { code: "IMPLANT", name: "\u79CD\u690D\u79D1", short: "\u79CD\u690D", sort: 4 },
        { code: "GENERAL", name: "\u7EFC\u5408\u53E3\u8154\u79D1", short: "\u7EFC\u5408", sort: 5 }
      ];
      await Promise.all(departments.map(async (dept) => {
        if (!await findOne("departments", { code: dept.code })) {
          await add("departments", { ...dept, status: "ACTIVE", createdAt: /* @__PURE__ */ new Date() });
        }
      }));
    }
    async function seedCatalogOnly() {
      await ensureOnly(["treatments"]);
      if (await findOne("treatments", { name: "\u6D01\u7259" }))
        return;
      await add("treatments", { name: "\u6D01\u7259", category: "\u9884\u9632", priceCents: 28e3, status: "ACTIVE" });
      await add("treatments", { name: "\u6811\u8102\u5145\u586B", category: "\u7259\u4F53\u7259\u9AD3", priceCents: 38e3, status: "ACTIVE" });
      await add("treatments", { name: "\u513F\u7AE5\u6D82\u6C1F", category: "\u513F\u7AE5\u53E3\u8154", priceCents: 18e3, status: "ACTIVE" });
    }
    var DEMO_PATIENTS = [
      { name: "\u6797\u53EF", phone: "13910001001", gender: "FEMALE", age: 32, address: "\u5E7F\u5DDE\u5E02\u5929\u6CB3\u533A\u534E\u7A57\u8DEF 18 \u53F7" },
      { name: "\u5468\u5B81", phone: "13910001002", gender: "MALE", age: 38, address: "\u5E7F\u5DDE\u5E02\u8D8A\u79C0\u533A\u4E1C\u98CE\u8DEF 8 \u53F7" },
      { name: "\u9648\u6668", phone: "13910001003", gender: "FEMALE", age: 27, address: "\u5E7F\u5DDE\u5E02\u6D77\u73E0\u533A\u65B0\u6E2F\u4E2D\u8DEF 12 \u53F7" },
      { name: "\u674E\u601D", phone: "13910001004", gender: "MALE", age: 45, address: "\u5E7F\u5DDE\u5E02\u756A\u79BA\u533A\u6C49\u6EAA\u5927\u9053 66 \u53F7" },
      { name: "\u9EC4\u60A6", phone: "13910001005", gender: "FEMALE", age: 19, address: "\u5E7F\u5DDE\u5E02\u5929\u6CB3\u533A\u5929\u6CB3\u5317\u8DEF 28 \u53F7" },
      { name: "\u5434\u6850", phone: "13910001006", gender: "MALE", age: 31, address: "\u5E7F\u5DDE\u5E02\u8D8A\u79C0\u533A\u73AF\u5E02\u4E1C\u8DEF 90 \u53F7" },
      { name: "\u90D1\u51EF", phone: "13910001007", gender: "MALE", age: 52, address: "\u5E7F\u5DDE\u5E02\u6D77\u73E0\u533A\u6EE8\u6C5F\u4E1C\u8DEF 33 \u53F7" },
      { name: "\u738B\u82B3", phone: "13910001008", gender: "FEMALE", age: 41, address: "\u5E7F\u5DDE\u5E02\u756A\u79BA\u533A\u5E02\u6865\u8857 18 \u53F7" }
    ];
    async function seedPatientsOnly() {
      await ensureOnly(["patients", "visits", "settlements"]);
      const patientMap = {};
      await Promise.all(DEMO_PATIENTS.map(async (p) => {
        let patient2 = await findOne("patients", { phone: p.phone });
        if (!patient2) {
          patient2 = await add("patients", {
            patientNo: makeNo("PAT"),
            name: p.name,
            phone: p.phone,
            gender: p.gender,
            age: p.age,
            billingAddress: p.address,
            status: "ACTIVE",
            createdAt: /* @__PURE__ */ new Date()
          });
        }
        patientMap[p.phone] = patient2;
      }));
      const first = patientMap["13910001001"];
      const second = patientMap["13910001002"];
      if (first && !await findOne("visits", { patientId: first._id })) {
        const visit = await add("visits", {
          visitNo: makeNo("VIS"),
          appointmentId: "",
          patientId: first._id,
          patientName: first.name,
          dentistName: "\u5F20\u660E",
          clinicName: "\u5929\u6CB3\u65D7\u8230\u5E97",
          visitDate: shanghaiDate(-30),
          problem: "\u53F3\u4E0B\u540E\u7259\u75BC\u75DB\uFF0C\u51B7\u70ED\u523A\u6FC0\u654F\u611F\u3002",
          treatmentName: "\u6811\u8102\u5145\u586B",
          treatmentAmountCents: 38e3,
          status: "COMPLETED",
          createdAt: /* @__PURE__ */ new Date()
        });
        await add("settlements", {
          settlementNo: makeNo("STL"),
          visitId: visit._id,
          patientId: first._id,
          patientName: first.name,
          totalCents: 38e3,
          status: "ACTIVE",
          versionNo: 1,
          balanceOrderId: null,
          createdAt: /* @__PURE__ */ new Date()
        });
      }
      if (second && !await findOne("visits", { patientId: second._id })) {
        const visit = await add("visits", {
          visitNo: makeNo("VIS"),
          appointmentId: "",
          patientId: second._id,
          patientName: second.name,
          dentistName: "\u674E\u60A6",
          clinicName: "\u8D8A\u79C0\u95E8\u8BCA",
          visitDate: shanghaiDate(-12),
          problem: "\u513F\u7AE5\u7A9D\u6C9F\u8F83\u6DF1\uFF0C\u8FDB\u884C\u9884\u9632\u6027\u5904\u7406\u3002",
          treatmentName: "\u513F\u7AE5\u6D82\u6C1F",
          treatmentAmountCents: 18e3,
          status: "COMPLETED",
          createdAt: /* @__PURE__ */ new Date()
        });
        await add("settlements", {
          settlementNo: makeNo("STL"),
          visitId: visit._id,
          patientId: second._id,
          patientName: second.name,
          totalCents: 18e3,
          status: "ACTIVE",
          versionNo: 1,
          balanceOrderId: null,
          createdAt: /* @__PURE__ */ new Date()
        });
      }
    }
    var DEMO_CLINICS = [
      { clinicNo: "ADC-001", name: "\u5929\u6CB3\u65D7\u8230\u5E97", address: "\u5E7F\u5DDE\u5E02\u5929\u6CB3\u533A\u4F53\u80B2\u897F\u8DEF 101 \u53F7", phone: "020-88880001", depositCents: 1e4 },
      { clinicNo: "ADC-002", name: "\u8D8A\u79C0\u95E8\u8BCA", address: "\u5E7F\u5DDE\u5E02\u8D8A\u79C0\u533A\u4E2D\u5C71\u4E94\u8DEF 88 \u53F7", phone: "020-88880002", depositCents: 1e4 },
      { clinicNo: "ADC-003", name: "\u6D77\u73E0\u53E3\u8154\u4E2D\u5FC3", address: "\u5E7F\u5DDE\u5E02\u6D77\u73E0\u533A\u6C5F\u5357\u5927\u9053\u4E2D 180 \u53F7", phone: "020-88880003", depositCents: 8e3 },
      { clinicNo: "ADC-004", name: "\u756A\u79BA\u4E07\u535A\u95E8\u8BCA", address: "\u5E7F\u5DDE\u5E02\u756A\u79BA\u533A\u6C49\u6EAA\u5927\u9053\u4E1C 366 \u53F7", phone: "020-88880004", depositCents: 12e3 }
    ];
    var DEMO_DENTISTS = [
      { name: "\u5F20\u660E", clinicNo: "ADC-001", title: "\u4E3B\u6CBB\u533B\u5E08", depts: ["ENDO", "IMPLANT", "GENERAL"], qualificationNames: "\u7259\u4F53\u7259\u9AD3\u3001\u79CD\u690D" },
      { name: "\u738B\u5CF0", clinicNo: "ADC-001", title: "\u526F\u4E3B\u4EFB\u533B\u5E08", depts: ["IMPLANT", "GENERAL"], qualificationNames: "\u79CD\u690D\u3001\u4FEE\u590D" },
      { name: "\u8D75\u5C9A", clinicNo: "ADC-001", title: "\u4E3B\u6CBB\u533B\u5E08", depts: ["ENDO", "GENERAL"], qualificationNames: "\u663E\u5FAE\u6839\u7BA1\u3001\u7259\u4F53\u4FEE\u590D" },
      { name: "\u5468\u822A", clinicNo: "ADC-001", title: "\u4E3B\u6CBB\u533B\u5E08", depts: ["ORTHO", "GENERAL"], qualificationNames: "\u6210\u4EBA\u6B63\u7578\u3001\u9690\u5F62\u77EB\u6B63" },
      { name: "\u9648\u96E8", clinicNo: "ADC-001", title: "\u4E3B\u6CBB\u533B\u5E08", depts: ["PEDO", "GENERAL"], qualificationNames: "\u513F\u7AE5\u53E3\u8154\u3001\u9884\u9632" },
      { name: "\u5B59\u60A6", clinicNo: "ADC-001", title: "\u4E3B\u6CBB\u533B\u5E08", depts: ["PEDO", "GENERAL"], qualificationNames: "\u513F\u7AE5\u65E9\u671F\u77EB\u6CBB" },
      { name: "\u674E\u60A6", clinicNo: "ADC-002", title: "\u526F\u4E3B\u4EFB\u533B\u5E08", depts: ["ORTHO", "PEDO", "GENERAL"], qualificationNames: "\u6B63\u7578\u3001\u513F\u7AE5\u53E3\u8154" },
      { name: "\u9AD8\u8FDC", clinicNo: "ADC-002", title: "\u4E3B\u6CBB\u533B\u5E08", depts: ["ENDO", "GENERAL"], qualificationNames: "\u6839\u7BA1\u6CBB\u7597\u3001\u7259\u4F53\u4FEE\u590D" },
      { name: "\u5510\u9759", clinicNo: "ADC-002", title: "\u4E3B\u6CBB\u533B\u5E08", depts: ["PEDO", "GENERAL"], qualificationNames: "\u513F\u7AE5\u53E3\u8154\u3001\u884C\u4E3A\u7BA1\u7406" },
      { name: "\u7F57\u4E39", clinicNo: "ADC-002", title: "\u4E3B\u6CBB\u533B\u5E08", depts: ["ORTHO", "GENERAL"], qualificationNames: "\u9752\u5C11\u5E74\u6B63\u7578" },
      { name: "\u80E1\u6768", clinicNo: "ADC-002", title: "\u4E3B\u6CBB\u533B\u5E08", depts: ["IMPLANT", "GENERAL"], qualificationNames: "\u79CD\u690D\u4FEE\u590D" },
      { name: "\u8BB8\u5B81", clinicNo: "ADC-002", title: "\u4E3B\u6CBB\u533B\u5E08", depts: ["ENDO", "GENERAL"], qualificationNames: "\u663E\u5FAE\u6839\u7BA1" },
      { name: "\u90ED\u5CF0", clinicNo: "ADC-003", title: "\u526F\u4E3B\u4EFB\u533B\u5E08", depts: ["ENDO", "IMPLANT", "GENERAL"], qualificationNames: "\u7259\u4F53\u7259\u9AD3\u3001\u79CD\u690D" },
      { name: "\u97E9\u96EA", clinicNo: "ADC-003", title: "\u4E3B\u6CBB\u533B\u5E08", depts: ["PEDO", "GENERAL"], qualificationNames: "\u513F\u7AE5\u53E3\u8154" },
      { name: "\u6881\u6668", clinicNo: "ADC-003", title: "\u4E3B\u6CBB\u533B\u5E08", depts: ["ORTHO", "GENERAL"], qualificationNames: "\u6210\u4EBA\u6B63\u7578" },
      { name: "\u5B8B\u4F73", clinicNo: "ADC-003", title: "\u4E3B\u6CBB\u533B\u5E08", depts: ["ENDO", "GENERAL"], qualificationNames: "\u6839\u7BA1\u6CBB\u7597" },
      { name: "\u9093\u8D85", clinicNo: "ADC-003", title: "\u4E3B\u6CBB\u533B\u5E08", depts: ["IMPLANT", "GENERAL"], qualificationNames: "\u53E3\u8154\u5916\u79D1\u3001\u79CD\u690D" },
      { name: "\u7A0B\u7433", clinicNo: "ADC-003", title: "\u4E3B\u6CBB\u533B\u5E08", depts: ["PEDO", "GENERAL"], qualificationNames: "\u513F\u7AE5\u53E3\u8154\u3001\u9884\u9632" },
      { name: "\u6797\u5CF0", clinicNo: "ADC-004", title: "\u526F\u4E3B\u4EFB\u533B\u5E08", depts: ["IMPLANT", "GENERAL"], qualificationNames: "\u79CD\u690D\u3001\u53E3\u8154\u5916\u79D1" },
      { name: "\u53F6\u9752", clinicNo: "ADC-004", title: "\u4E3B\u6CBB\u533B\u5E08", depts: ["ORTHO", "GENERAL"], qualificationNames: "\u6B63\u7578\u3001\u54AC\u5408\u7BA1\u7406" },
      { name: "\u4F55\u9759", clinicNo: "ADC-004", title: "\u4E3B\u6CBB\u533B\u5E08", depts: ["PEDO", "GENERAL"], qualificationNames: "\u513F\u7AE5\u53E3\u8154" },
      { name: "\u66F9\u9633", clinicNo: "ADC-004", title: "\u4E3B\u6CBB\u533B\u5E08", depts: ["ENDO", "GENERAL"], qualificationNames: "\u7259\u4F53\u7259\u9AD3" },
      { name: "\u7F57\u6B23", clinicNo: "ADC-004", title: "\u4E3B\u6CBB\u533B\u5E08", depts: ["PEDO", "GENERAL"], qualificationNames: "\u513F\u7AE5\u65E9\u671F\u77EB\u6CBB" },
      { name: "\u848B\u6D9B", clinicNo: "ADC-004", title: "\u4E3B\u6CBB\u533B\u5E08", depts: ["GENERAL", "ORTHO"], qualificationNames: "\u7EFC\u5408\u6CBB\u7597\u3001\u6B63\u7578" }
    ];
    async function seedClinicsOnly() {
      await ensureOnly(["clinics"]);
      await Promise.all(DEMO_CLINICS.map(async (info) => {
        const clinic = await findOne("clinics", { clinicNo: info.clinicNo });
        if (!clinic)
          await add("clinics", { ...info, status: "ACTIVE" });
      }));
    }
    async function seedClinicDoctors(clinicId) {
      await ensureOnly(["dentists"]);
      const clinic = await getDoc("clinics", clinicId);
      if (!clinic)
        return [];
      const definitions = DEMO_DENTISTS.filter((d) => d.clinicNo === clinic.clinicNo);
      await Promise.all(definitions.map(async (info) => {
        let dentist = await findOne("dentists", { name: info.name, clinicId: clinic._id });
        if (!dentist) {
          await add("dentists", {
            name: info.name,
            title: info.title,
            clinicId: clinic._id,
            departmentIds: info.depts,
            qualificationNames: info.qualificationNames,
            status: "ACTIVE",
            createdAt: /* @__PURE__ */ new Date()
          });
        } else if (!dentist.departmentIds) {
          await update("dentists", dentist._id, { departmentIds: info.depts, qualificationNames: info.qualificationNames });
        }
      }));
      return definitions;
    }
    async function seedChairs(clinicId) {
      await ensureOnly(["chairs"]);
      const clinic = await getDoc("clinics", clinicId);
      if (!clinic)
        return [];
      let chairs = await list("chairs", { clinicId, status: "ACTIVE" }, { orderBy: { field: "chairNo", direction: "asc" } });
      if (chairs.length)
        return chairs;
      await Promise.all([1, 2, 3, 4, 5, 6].map(async (n) => {
        await add("chairs", {
          clinicId,
          chairNo: `C${n}`,
          name: `${n} \u53F7\u7259\u6905`,
          status: "ACTIVE",
          createdAt: /* @__PURE__ */ new Date()
        });
      }));
      return list("chairs", { clinicId, status: "ACTIVE" }, { orderBy: { field: "chairNo", direction: "asc" } });
    }
    async function seedDemo2() {
      await ensureCollections();
      const meta = await getDoc("meta", "demo");
      if (meta && meta.seeded)
        return meta;
      const clinic1 = await add("clinics", {
        clinicNo: "ADC-001",
        name: "\u5929\u6CB3\u65D7\u8230\u5E97",
        address: "\u5E7F\u5DDE\u5E02\u5929\u6CB3\u533A\u4F53\u80B2\u897F\u8DEF 101 \u53F7",
        phone: "020-88880001",
        depositCents: 1e4,
        status: "ACTIVE"
      });
      const clinic2 = await add("clinics", {
        clinicNo: "ADC-002",
        name: "\u8D8A\u79C0\u95E8\u8BCA",
        address: "\u5E7F\u5DDE\u5E02\u8D8A\u79C0\u533A\u4E2D\u5C71\u4E94\u8DEF 88 \u53F7",
        phone: "020-88880002",
        depositCents: 1e4,
        status: "ACTIVE"
      });
      const dentist1 = await add("dentists", {
        name: "\u5F20\u660E",
        title: "\u4E3B\u6CBB\u533B\u5E08",
        clinicId: clinic1._id,
        departmentIds: ["ENDO", "IMPLANT", "GENERAL"],
        qualificationNames: "\u7259\u4F53\u7259\u9AD3\u3001\u79CD\u690D",
        status: "ACTIVE"
      });
      const dentist2 = await add("dentists", {
        name: "\u674E\u60A6",
        title: "\u526F\u4E3B\u4EFB\u533B\u5E08",
        clinicId: clinic2._id,
        departmentIds: ["ORTHO", "PEDO", "GENERAL"],
        qualificationNames: "\u6B63\u7578\u3001\u513F\u7AE5\u53E3\u8154",
        status: "ACTIVE"
      });
      const patient1 = await add("patients", {
        name: "\u6797\u53EF",
        phone: "13910001001",
        birthDate: "1994-05-20",
        billingAddress: "\u5E7F\u5DDE\u5E02\u5929\u6CB3\u533A\u534E\u7A57\u8DEF 18 \u53F7",
        status: "ACTIVE"
      });
      const patient2 = await add("patients", {
        name: "\u5468\u5B81",
        phone: "13910001002",
        birthDate: "1988-11-02",
        billingAddress: "\u5E7F\u5DDE\u5E02\u8D8A\u79C0\u533A\u4E1C\u98CE\u8DEF 8 \u53F7",
        status: "ACTIVE"
      });
      await add("users", {
        role: "HQ_MANAGER",
        staffUsername: "admin",
        displayName: "\u603B\u90E8\u7BA1\u7406\u5458",
        passwordHash: hashPassword("Dental@2026"),
        clinicIds: [clinic1._id, clinic2._id],
        status: "ACTIVE",
        staff: true
      });
      await add("users", {
        role: "FRONT_DESK",
        staffUsername: "frontdesk",
        displayName: "\u524D\u53F0\u5C0F\u6797",
        passwordHash: hashPassword("Dental@2026"),
        clinicIds: [clinic1._id],
        status: "ACTIVE",
        staff: true
      });
      const schedules = [];
      for (let i = 1; i <= 7; i += 1) {
        const date = shanghaiDate(i);
        schedules.push(await add("schedules", {
          clinicId: clinic1._id,
          dentistId: dentist1._id,
          date,
          startMinute: 540,
          endMinute: 1080,
          durationMinutes: 30,
          status: "PUBLISHED"
        }));
        schedules.push(await add("schedules", {
          clinicId: clinic2._id,
          dentistId: dentist2._id,
          date,
          startMinute: 540,
          endMinute: 1080,
          durationMinutes: 30,
          status: "PUBLISHED"
        }));
      }
      const sampleDate = shanghaiDate(1);
      const sampleAppointment = await add("appointments", {
        appointmentNo: makeNo("APT"),
        patientId: patient1._id,
        patientName: patient1.name,
        patientPhone: patient1.phone,
        dentistId: dentist1._id,
        dentistName: dentist1.name,
        clinicId: clinic1._id,
        clinicNo: clinic1.clinicNo,
        clinicName: clinic1.name,
        departmentId: "",
        departmentName: "\u7259\u4F53\u7259\u9AD3\u79D1",
        scheduleId: schedules[0]._id,
        date: sampleDate,
        startMinute: 630,
        endMinute: 660,
        status: "SCHEDULED",
        channel: "STAFF",
        depositOrderId: null,
        holdExpiresAt: null,
        createdAt: /* @__PURE__ */ new Date()
      });
      const sampleVisit = await add("visits", {
        visitNo: makeNo("VIS"),
        appointmentId: sampleAppointment._id,
        patientId: patient1._id,
        patientName: patient1.name,
        dentistName: dentist1.name,
        clinicName: clinic1.name,
        visitDate: sampleDate,
        problem: "\u53F3\u4E0B\u540E\u7259\u75BC\u75DB\uFF0C\u68C0\u67E5\u540E\u5B8C\u6210\u5145\u586B\u3002",
        treatmentName: "\u6811\u8102\u5145\u586B",
        treatmentAmountCents: 28e3,
        status: "COMPLETED",
        createdAt: /* @__PURE__ */ new Date()
      });
      const sampleSettlement = await add("settlements", {
        settlementNo: makeNo("STL"),
        visitId: sampleVisit._id,
        patientId: patient1._id,
        patientName: patient1.name,
        totalCents: 28e3,
        status: "ACTIVE",
        versionNo: 1,
        balanceOrderId: null,
        createdAt: /* @__PURE__ */ new Date()
      });
      await db.collection("meta").doc("demo").set({
        data: { seeded: true, seededAt: /* @__PURE__ */ new Date(), version: 1 }
      });
      return { seeded: true, clinicId: clinic1._id, patientId: patient1._id, settlementId: sampleSettlement._id };
    }
    module2.exports = {
      seedDemo: seedDemo2,
      seedStaffOnly,
      seedClinicsOnly,
      seedClinicDoctors,
      seedChairs,
      seedPatientsOnly,
      seedDepartmentsOnly,
      seedCatalogOnly,
      ensureOnly,
      shanghaiDate
    };
  }
});

// wechat-miniprogram/cloudfunctions/api/lib/auth.js
var require_auth = __commonJS({
  "wechat-miniprogram/cloudfunctions/api/lib/auth.js"(exports2, module2) {
    var { db, ensureCollections } = require_db();
    var { findOne, getDoc, add } = require_db();
    var { randomToken, verifyPassword, hashPassword, makeNo } = require_security();
    var CORE = ["users", "patients", "sessions"];
    function publicUser(user) {
      if (!user)
        return null;
      return {
        id: user._id,
        role: user.role,
        displayName: user.displayName,
        account: user.patientUsername || user.staffUsername || "",
        patientId: user.patientId || null,
        clinicIds: user.clinicIds || [],
        staff: Boolean(user.staff),
        status: user.status || "ACTIVE"
      };
    }
    async function getSessionUser(token) {
      if (!token)
        return null;
      const session = await findOne("sessions", { token });
      if (!session || new Date(session.expiresAt).getTime() < Date.now())
        return null;
      return getDoc("users", session.userId);
    }
    async function createSession(user) {
      const token = randomToken();
      await add("sessions", {
        token,
        userId: user._id,
        expiresAt: new Date(Date.now() + 8 * 36e5),
        createdAt: /* @__PURE__ */ new Date()
      });
      return token;
    }
    async function bootstrap2(token) {
      if (!token)
        return { user: null, patient: null };
      const user = await getSessionUser(token);
      if (!user || user.status !== "ACTIVE" || user.staff)
        return { user: null, patient: null };
      const patient2 = user.patientId ? await getDoc("patients", user.patientId) : null;
      return { user: publicUser(user), patient: patient2, token };
    }
    async function generatePatientAccount() {
      for (let i = 0; i < 12; i += 1) {
        const account = "P" + String(Math.floor(1e7 + Math.random() * 9e7));
        if (!await findOne("users", { patientUsername: account }))
          return account;
      }
      throw new Error("\u8D26\u53F7\u5206\u914D\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5");
    }
    async function registerPatient2(input) {
      await ensureCollections(CORE);
      const name = String(input.name || "").trim();
      const gender = String(input.gender || "").trim();
      const age = Number(input.age);
      const phone = String(input.phone || "").trim();
      const password = String(input.password || "");
      if (name.length < 2 || name.length > 30)
        throw new Error("\u59D3\u540D\u9700\u4E3A 2-30 \u4E2A\u5B57\u7B26");
      if (!["MALE", "FEMALE", "OTHER"].includes(gender))
        throw new Error("\u8BF7\u9009\u62E9\u6027\u522B");
      if (!Number.isInteger(age) || age < 0 || age > 120)
        throw new Error("\u5E74\u9F84\u9700\u5728 0-120 \u4E4B\u95F4");
      if (!/^\d{6,20}$/.test(phone))
        throw new Error("\u8BF7\u8F93\u5165\u6709\u6548\u624B\u673A\u53F7");
      if (password.length < 6)
        throw new Error("\u5BC6\u7801\u81F3\u5C11 6 \u4F4D");
      if (await findOne("patients", { phone }))
        throw new Error("\u8BE5\u624B\u673A\u53F7\u5DF2\u6CE8\u518C\u60A3\u8005\u8D26\u53F7");
      const account = await generatePatientAccount();
      const patient2 = await add("patients", {
        patientNo: makeNo("PAT"),
        name,
        gender,
        age,
        phone,
        billingAddress: "\u5F85\u8865\u5145",
        status: "ACTIVE",
        createdAt: /* @__PURE__ */ new Date()
      });
      await add("users", {
        patientUsername: account,
        passwordHash: hashPassword(password),
        role: "PATIENT",
        displayName: name,
        patientId: patient2._id,
        status: "ACTIVE",
        staff: false,
        createdAt: /* @__PURE__ */ new Date()
      });
      return { account, patientNo: patient2.patientNo, patientName: name };
    }
    async function loginPatient2(account, password) {
      await ensureCollections(CORE);
      const user = await findOne("users", { patientUsername: String(account || "").trim(), staff: false });
      if (!user || user.status !== "ACTIVE" || !verifyPassword(password, user.passwordHash)) {
        const error = new Error("\u8D26\u53F7\u6216\u5BC6\u7801\u9519\u8BEF");
        error.code = "AUTH_FAILED";
        throw error;
      }
      const token = await createSession(user);
      const patient2 = user.patientId ? await getDoc("patients", user.patientId) : null;
      return { user: publicUser(user), patient: patient2, token };
    }
    async function logout(token) {
      if (!token)
        return;
      const session = await findOne("sessions", { token });
      if (session)
        await db.collection("sessions").doc(session._id).remove();
    }
    async function requireUser2(token) {
      const user = await getSessionUser(token);
      if (!user || user.status !== "ACTIVE" || user.staff) {
        const error = new Error("\u8BF7\u5148\u767B\u5F55\u60A3\u8005\u8D26\u53F7");
        error.code = "UNAUTHORIZED";
        throw error;
      }
      return user;
    }
    function requirePatient(user) {
      if (!user || user.role !== "PATIENT" || !user.patientId) {
        const error = new Error("\u8BE5\u64CD\u4F5C\u4EC5\u9650\u60A3\u8005\u8D26\u53F7");
        error.code = "FORBIDDEN";
        throw error;
      }
      return user.patientId;
    }
    module2.exports = {
      publicUser,
      getSessionUser,
      bootstrap: bootstrap2,
      registerPatient: registerPatient2,
      loginPatient: loginPatient2,
      logout,
      logoutStaff: logout,
      requireUser: requireUser2,
      requirePatient
    };
  }
});

// wechat-miniprogram/cloudfunctions/api/lib/patient.js
var require_patient = __commonJS({
  "wechat-miniprogram/cloudfunctions/api/lib/patient.js"(exports2, module2) {
    var { db, _, getDoc, findOne, add, update, list, ensureCollections } = require_db();
    var { makeNo, cents, yuan } = require_security();
    var { requirePatient } = require_auth();
    var { seedClinicsOnly, seedClinicDoctors, seedChairs, seedPatientsOnly, seedDepartmentsOnly, seedCatalogOnly } = require_seed();
    function nowShanghaiParts() {
      const d = new Date(Date.now() + 8 * 36e5);
      return {
        date: d.toISOString().slice(0, 10),
        minutes: d.getUTCHours() * 60 + d.getUTCMinutes()
      };
    }
    function appointmentStart(date, minute) {
      return /* @__PURE__ */ new Date(`${date}T${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00+08:00`);
    }
    function fmtClinic(c) {
      return {
        id: c._id,
        clinicNo: c.clinicNo,
        name: c.name,
        address: c.address,
        phone: c.phone,
        depositCents: c.depositCents || 0,
        deposit: yuan(c.depositCents || 0),
        patientBookingEnabled: Number(c.depositCents || 0) > 0
      };
    }
    function fmtAppointment(a) {
      return {
        id: a._id,
        no: a.appointmentNo,
        patientName: a.patientName || "",
        date: a.date,
        startMinute: a.startMinute,
        endMinute: a.endMinute,
        status: a.status,
        clinicName: a.clinicName,
        clinicNo: a.clinicNo,
        dentistName: a.dentistName,
        departmentName: a.departmentName || "",
        chairNo: a.chairNo || "",
        expectedTreatment: a.expectedTreatment || "",
        holdExpiresAt: a.holdExpiresAt || null,
        depositOrderId: a.depositOrderId || null,
        channel: a.channel
      };
    }
    function fmtOrder(o) {
      return {
        id: o._id,
        no: o.orderNo,
        type: o.type,
        patientName: o.patientName || "",
        amountCents: o.amountCents,
        amount: yuan(o.amountCents),
        status: o.status,
        appointmentId: o.appointmentId || null,
        createdAt: o.createdAt,
        expiresAt: o.expiresAt || null,
        paidCents: o.paidCents || 0,
        appliedCents: o.appliedCents || 0,
        refundedCents: o.refundedCents || 0,
        reservedCents: o.reservedCents || 0,
        description: o.description || ""
      };
    }
    async function notify(userId, type, title, body, relatedType, relatedId) {
      if (!userId)
        return;
      await add("notifications", {
        userId,
        type,
        title,
        body,
        relatedType: relatedType || "",
        relatedId: relatedId || "",
        readAt: null,
        createdAt: /* @__PURE__ */ new Date()
      }).catch(() => null);
    }
    async function getPatientHome(user) {
      const patient2 = await getDoc("patients", user.patientId);
      const [appointments, orders, notifications, visits] = await Promise.all([
        list("appointments", { patientId: user.patientId }, { orderBy: { field: "createdAt", direction: "desc" }, limit: 10 }),
        list("payment_orders", { patientId: user.patientId }, { orderBy: { field: "createdAt", direction: "desc" }, limit: 10 }),
        list("notifications", { userId: user._id }, { orderBy: { field: "createdAt", direction: "desc" }, limit: 6 }),
        list("visits", { patientId: user.patientId }, { orderBy: { field: "visitDate", direction: "desc" }, limit: 5 })
      ]);
      return {
        patient: patient2 || null,
        appointments: appointments.map(fmtAppointment),
        orders: orders.map(fmtOrder),
        unread: notifications.filter((n) => !n.readAt).length,
        notifications,
        visits
      };
    }
    async function listClinics() {
      await seedClinicsOnly();
      const rows = await list("clinics", { status: "ACTIVE" }, { orderBy: { field: "clinicNo", direction: "asc" } });
      return rows.map(fmtClinic);
    }
    async function listDepartments() {
      await seedDepartmentsOnly();
      const rows = await list("departments", { status: "ACTIVE" }, { orderBy: { field: "sort", direction: "asc" } });
      return rows.map((d) => ({ id: d._id, code: d.code, name: d.name, short: d.short }));
    }
    async function listDentists(clinicId, departmentId) {
      if (clinicId)
        await seedClinicDoctors(clinicId);
      const where = { status: "ACTIVE" };
      if (clinicId)
        where.clinicId = clinicId;
      let rows = await list("dentists", where, { orderBy: { field: "name", direction: "asc" } });
      if (departmentId)
        rows = rows.filter((d) => (d.departmentIds || []).includes(departmentId));
      return rows.map((d) => ({
        id: d._id,
        name: d.name,
        title: d.title,
        clinicId: d.clinicId,
        departmentIds: d.departmentIds || [],
        qualificationNames: d.qualificationNames,
        initial: String(d.name || "\u533B").slice(0, 1)
      }));
    }
    async function listTreatments() {
      await seedCatalogOnly();
      return list("treatments", { status: "ACTIVE" }, { orderBy: { field: "category", direction: "asc" } });
    }
    async function getAvailability({ clinicId, date, dentistId }) {
      await ensureCollections(["clinics", "dentists", "schedules", "appointments"]);
      const clinic = await getDoc("clinics", clinicId);
      if (!clinic || clinic.status !== "ACTIVE")
        throw new Error("\u8BCA\u6240\u4E0D\u5B58\u5728\u6216\u5DF2\u505C\u7528");
      if (!date)
        throw new Error("\u8BF7\u9009\u62E9\u65E5\u671F");
      const chairs = await seedChairs(clinicId);
      const where = { clinicId, date, status: "PUBLISHED" };
      if (dentistId)
        where.dentistId = dentistId;
      let schedules = await list("schedules", where);
      const chairSchedules = await list("schedules", {
        clinicId,
        date,
        chairId: _.in(chairs.map((c) => c._id))
      });
      const usedChairs = new Set(chairSchedules.map((s) => s.chairId));
      const pickChair = () => chairs.find((c) => !usedChairs.has(c._id));
      for (const schedule of schedules) {
        if (!schedule.chairId) {
          const chair = pickChair();
          if (chair) {
            usedChairs.add(chair._id);
            await update("schedules", schedule._id, { chairId: chair._id, chairNo: chair.chairNo });
            schedule.chairId = chair._id;
            schedule.chairNo = chair.chairNo;
          }
        }
      }
      if (!schedules.length && dentistId) {
        const dentist = await getDoc("dentists", dentistId);
        if (dentist) {
          const chair = pickChair();
          if (!chair)
            throw new Error("\u5F53\u65E5\u7259\u6905\u5DF2\u6392\u6EE1\uFF0C\u8BF7\u66F4\u6362\u65E5\u671F");
          const created = await add("schedules", {
            clinicId,
            dentistId,
            chairId: chair._id,
            chairNo: chair.chairNo,
            date,
            startMinute: 540,
            endMinute: 1080,
            durationMinutes: 30,
            status: "PUBLISHED",
            createdAt: /* @__PURE__ */ new Date()
          });
          schedules = [created];
        }
      }
      const appointments = await list("appointments", {
        clinicId,
        date,
        status: _.in(["SCHEDULED", "PENDING_PAYMENT"])
      });
      const now = nowShanghaiParts();
      const result = [];
      for (const schedule of schedules) {
        for (let minute = schedule.startMinute; minute + schedule.durationMinutes <= schedule.endMinute; minute += 30) {
          if (date === now.date && minute < now.minutes + 5)
            continue;
          const blocked = appointments.some(
            (a) => a.dentistId === schedule.dentistId && a.status === "SCHEDULED" && minute < a.endMinute && minute + schedule.durationMinutes > a.startMinute
          ) || appointments.some(
            (a) => a.dentistId === schedule.dentistId && a.status === "PENDING_PAYMENT" && a.holdExpiresAt && new Date(a.holdExpiresAt).getTime() > Date.now() && minute < a.endMinute && minute + schedule.durationMinutes > a.startMinute
          ) || schedule.chairId && appointments.some(
            (a) => a.chairId === schedule.chairId && (a.status === "SCHEDULED" || a.status === "PENDING_PAYMENT" && a.holdExpiresAt && new Date(a.holdExpiresAt).getTime() > Date.now()) && minute < a.endMinute && minute + schedule.durationMinutes > a.startMinute
          );
          if (!blocked) {
            result.push({
              scheduleId: schedule._id,
              dentistId: schedule.dentistId,
              chairId: schedule.chairId || "",
              chairNo: schedule.chairNo || "",
              date,
              startMinute: minute,
              endMinute: minute + schedule.durationMinutes,
              durationMinutes: schedule.durationMinutes,
              label: `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
            });
          }
        }
      }
      return { clinic: fmtClinic(clinic), slots: result };
    }
    async function createAppointment({ user, clinicId, dentistId, departmentId, date, startMinute, durationMinutes, expectedTreatment }) {
      const patientId = requirePatient(user);
      await ensureCollections(["appointments", "payment_orders", "notifications"]);
      const department = departmentId ? await getDoc("departments", departmentId) : null;
      const clinic = await getDoc("clinics", clinicId);
      if (!clinic || clinic.status !== "ACTIVE")
        throw new Error("\u8BCA\u6240\u5DF2\u505C\u7528");
      if (!clinic.depositCents || clinic.depositCents <= 0)
        throw new Error("\u8BE5\u8BCA\u6240\u672A\u5F00\u653E\u60A3\u8005\u81EA\u52A9\u9884\u7EA6");
      const schedule = await findOne("schedules", { clinicId, dentistId, date, status: "PUBLISHED" });
      if (!schedule)
        throw new Error("\u8BE5\u65F6\u6BB5\u6CA1\u6709\u53EF\u7528\u6392\u73ED");
      const endMinute = Number(startMinute) + Number(durationMinutes || schedule.durationMinutes || 30);
      if (startMinute < schedule.startMinute || endMinute > schedule.endMinute)
        throw new Error("\u9884\u7EA6\u65F6\u6BB5\u8D85\u51FA\u6392\u73ED\u8303\u56F4");
      const chairs = await seedChairs(clinicId);
      let chairId = schedule.chairId || "";
      let chairNo = schedule.chairNo || "";
      if (!chairId) {
        const chair = chairs[0];
        if (!chair)
          throw new Error("\u8BE5\u8BCA\u6240\u6682\u672A\u914D\u7F6E\u7259\u6905");
        chairId = chair._id;
        chairNo = chair.chairNo;
        await update("schedules", schedule._id, { chairId, chairNo });
      }
      const existing = await list("appointments", { clinicId, date, status: _.in(["SCHEDULED", "PENDING_PAYMENT"]) });
      const conflict = existing.some(
        (a) => Number(startMinute) < a.endMinute && Number(endMinute) > a.startMinute && (a.status === "SCHEDULED" || a.holdExpiresAt && new Date(a.holdExpiresAt).getTime() > Date.now()) && (a.dentistId === dentistId || a.chairId === chairId)
      );
      if (conflict)
        throw new Error("\u8BE5\u533B\u751F\u6216\u7259\u6905\u65F6\u6BB5\u5DF2\u88AB\u9884\u7EA6");
      const dentist = await getDoc("dentists", dentistId);
      const patient2 = await getDoc("patients", patientId);
      const holdExpiresAt = new Date(Date.now() + 15 * 6e4);
      const appointment = await add("appointments", {
        appointmentNo: makeNo("APT"),
        patientId,
        patientName: patient2.name,
        patientPhone: patient2.phone || "",
        dentistId,
        dentistName: dentist ? dentist.name : "\u7259\u533B",
        clinicId,
        clinicNo: clinic.clinicNo,
        clinicName: clinic.name,
        departmentId: department ? department._id : "",
        departmentName: department ? department.name : "",
        chairId,
        chairNo,
        scheduleId: schedule._id,
        date,
        startMinute: Number(startMinute),
        endMinute,
        expectedTreatment: String(expectedTreatment || "\u53E3\u8154\u68C0\u67E5"),
        status: "PENDING_PAYMENT",
        channel: "PATIENT_SELF_SERVICE",
        holdExpiresAt,
        createdAt: /* @__PURE__ */ new Date()
      });
      const order = await add("payment_orders", {
        orderNo: makeNo("PAY"),
        patientId,
        patientName: patient2.name,
        clinicId,
        appointmentId: appointment._id,
        type: "APPOINTMENT_DEPOSIT",
        amountCents: clinic.depositCents,
        status: "PENDING_PAYMENT",
        paidCents: 0,
        appliedCents: 0,
        refundedCents: 0,
        reservedCents: 0,
        expiresAt: holdExpiresAt,
        description: "\u60A3\u8005\u81EA\u52A9\u9884\u7EA6\u91D1",
        createdAt: /* @__PURE__ */ new Date()
      });
      await update("appointments", appointment._id, { depositOrderId: order._id });
      await notify(user._id, "APPOINTMENT_CREATED", "\u9884\u7EA6\u5F85\u652F\u4ED8", `\u9884\u7EA6 ${appointment.appointmentNo} \u5DF2\u5360\u4F4D 15 \u5206\u949F\uFF0C\u8BF7\u652F\u4ED8\u9884\u7EA6\u91D1\u3002`, "appointment", appointment._id);
      return { appointment: { ...appointment, depositOrderId: order._id }, order };
    }
    async function listAppointments(user) {
      const rows = await list("appointments", { patientId: user.patientId }, { orderBy: { field: "date", direction: "desc" }, limit: 50 });
      return rows.map(fmtAppointment);
    }
    async function getAppointment(user, id) {
      const a = await getDoc("appointments", id);
      if (!a)
        throw new Error("\u9884\u7EA6\u4E0D\u5B58\u5728");
      if (!user.staff && a.patientId !== user.patientId)
        throw new Error("\u9884\u7EA6\u4E0D\u5B58\u5728");
      if (user.staff && user.role !== "HQ_MANAGER" && !(user.clinicIds || []).includes(a.clinicId)) {
        throw new Error("\u8BE5\u9884\u7EA6\u4E0D\u5728\u60A8\u7684\u6388\u6743\u8303\u56F4\u5185");
      }
      const orders = await list("payment_orders", { appointmentId: id }, { orderBy: { field: "createdAt", direction: "desc" } });
      const changes = await list("appointment_changes", { appointmentId: id }, { orderBy: { field: "createdAt", direction: "desc" } });
      return { appointment: fmtAppointment(a), orders: orders.map(fmtOrder), changes };
    }
    async function payOrder({ user, orderId, outcome }) {
      requirePatient(user);
      await ensureCollections(["payment_transactions", "notifications"]);
      const order = await getDoc("payment_orders", orderId);
      if (!order || order.patientId !== user.patientId)
        throw new Error("\u8BA2\u5355\u4E0D\u5B58\u5728");
      if (order.status === "CLOSED" || order.status === "CANCELLED" || order.status === "FORFEITED")
        throw new Error("\u8BA2\u5355\u5DF2\u5173\u95ED");
      if (outcome !== "SUCCESS") {
        await add("payment_transactions", {
          transactionNo: makeNo("TXN"),
          orderId,
          type: order.type,
          amountCents: order.amountCents,
          channel: "MOCK",
          status: "FAILED",
          createdAt: /* @__PURE__ */ new Date()
        });
        await notify(user._id, "PAYMENT_FAILED", "\u6A21\u62DF\u652F\u4ED8\u5931\u8D25", "\u652F\u4ED8\u672A\u6210\u529F\uFF0C\u8BA2\u5355\u4ECD\u53EF\u7EE7\u7EED\u652F\u4ED8\u3002", "payment_order", order._id);
        return { order: fmtOrder(order), simulated: true };
      }
      if (order.type === "APPOINTMENT_DEPOSIT") {
        const appointment = await getDoc("appointments", order.appointmentId);
        if (!appointment || appointment.status !== "PENDING_PAYMENT")
          throw new Error("\u9884\u7EA6\u5DF2\u4E0D\u53EF\u786E\u8BA4");
        if (order.expiresAt && new Date(order.expiresAt).getTime() < Date.now())
          throw new Error("\u9884\u7EA6\u5360\u4F4D\u5DF2\u8FC7\u671F");
        await update("payment_orders", order._id, { status: "PAID", paidCents: order.amountCents, paidAt: /* @__PURE__ */ new Date() });
        await update("appointments", appointment._id, { status: "SCHEDULED", confirmedAt: /* @__PURE__ */ new Date(), holdExpiresAt: null });
        await add("payment_transactions", {
          transactionNo: makeNo("TXN"),
          orderId: order._id,
          type: order.type,
          amountCents: order.amountCents,
          channel: "MOCK",
          status: "SUCCEEDED",
          createdAt: /* @__PURE__ */ new Date()
        });
        await notify(user._id, "APPOINTMENT_CONFIRMED", "\u9884\u7EA6\u5DF2\u786E\u8BA4", "\u9884\u7EA6\u91D1\u6A21\u62DF\u652F\u4ED8\u6210\u529F\uFF0C\u9884\u7EA6\u5DF2\u6B63\u5F0F\u786E\u8BA4\u3002", "appointment", appointment._id);
        return { order: { ...fmtOrder(order), status: "PAID", paidCents: order.amountCents } };
      }
      const outstanding = order.amountCents - (order.paidCents || 0) + (order.refundedCents || 0);
      if (outstanding <= 0)
        throw new Error("\u8BA2\u5355\u5DF2\u7ED3\u6E05");
      await update("payment_orders", order._id, { status: "PAID", paidCents: order.amountCents, paidAt: /* @__PURE__ */ new Date() });
      await add("payment_transactions", {
        transactionNo: makeNo("TXN"),
        orderId: order._id,
        type: order.type,
        amountCents: outstanding,
        channel: "MOCK",
        status: "SUCCEEDED",
        createdAt: /* @__PURE__ */ new Date()
      });
      await notify(user._id, "PAYMENT_SUCCEEDED", "\u4F59\u989D\u652F\u4ED8\u6210\u529F", "\u8BCA\u540E\u4F59\u989D\u6A21\u62DF\u652F\u4ED8\u6210\u529F\u3002", "payment_order", order._id);
      return { order: { ...fmtOrder(order), status: "PAID", paidCents: order.amountCents } };
    }
    async function cancelAppointment({ user, appointmentId, reason }) {
      requirePatient(user);
      await ensureCollections(["refunds", "appointment_changes", "notifications"]);
      const appointment = await getDoc("appointments", appointmentId);
      if (!appointment || appointment.patientId !== user.patientId)
        throw new Error("\u9884\u7EA6\u4E0D\u5B58\u5728");
      if (!["PENDING_PAYMENT", "SCHEDULED"].includes(appointment.status))
        throw new Error("\u5F53\u524D\u9884\u7EA6\u4E0D\u80FD\u53D6\u6D88");
      const orders = await list("payment_orders", { appointmentId, type: "APPOINTMENT_DEPOSIT" });
      const order = orders[0] || null;
      const start = appointmentStart(appointment.date, appointment.startMinute);
      const seconds = Math.floor((start.getTime() - Date.now()) / 1e3);
      let refund = null;
      let forfeited = false;
      if (appointment.status === "PENDING_PAYMENT") {
        if (order)
          await update("payment_orders", order._id, { status: "CANCELLED", closedAt: /* @__PURE__ */ new Date() });
      } else if (order && order.status === "PAID") {
        if (seconds >= 86400) {
          refund = await add("refunds", {
            refundNo: makeNo("RFD"),
            orderId: order._id,
            appointmentId,
            amountCents: order.amountCents,
            reasonCode: "PATIENT_EARLY_CANCEL",
            reasonText: reason || "\u60A3\u8005\u63D0\u524D\u53D6\u6D88",
            status: "PENDING_REVIEW",
            requestedBy: user._id,
            createdAt: /* @__PURE__ */ new Date()
          });
          await update("payment_orders", order._id, { status: "REFUNDING", reservedCents: order.amountCents });
        } else {
          forfeited = true;
          await update("payment_orders", order._id, { status: "FORFEITED", forfeitedAt: /* @__PURE__ */ new Date(), forfeitedReason: "PATIENT_LATE_CANCEL" });
        }
      }
      await update("appointments", appointment._id, { status: "CANCELLED", cancelReason: reason || "", cancelledAt: /* @__PURE__ */ new Date() });
      await add("appointment_changes", {
        appointmentId,
        type: "CANCEL",
        reason: reason || "",
        initiator: "PATIENT",
        secondsBeforeStart: seconds,
        refundEligible: seconds >= 86400,
        refundCents: refund ? refund.amountCents : 0,
        createdAt: /* @__PURE__ */ new Date()
      });
      await notify(user._id, "APPOINTMENT_CANCELLED", "\u9884\u7EA6\u5DF2\u53D6\u6D88", refund ? "\u5DF2\u63D0\u4EA4\u9000\u6B3E\u7533\u8BF7\uFF0C\u7B49\u5F85\u4E3B\u7BA1\u5BA1\u6838\u3002" : "\u9884\u7EA6\u5DF2\u53D6\u6D88\u3002", "appointment", appointmentId);
      return { cancelled: true, refund, forfeited };
    }
    async function listOrders(user) {
      const rows = await list("payment_orders", { patientId: user.patientId }, { orderBy: { field: "createdAt", direction: "desc" }, limit: 50 });
      return rows.map(fmtOrder);
    }
    async function getOrder(user, id) {
      await ensureCollections(["payment_transactions", "refunds"]);
      const order = await getDoc("payment_orders", id);
      if (!order || order.patientId !== user.patientId)
        throw new Error("\u8BA2\u5355\u4E0D\u5B58\u5728");
      const transactions = await list("payment_transactions", { orderId: id }, { orderBy: { field: "createdAt", direction: "desc" } });
      const refunds = await list("refunds", { orderId: id }, { orderBy: { field: "createdAt", direction: "desc" } });
      return { order: fmtOrder(order), transactions, refunds };
    }
    async function listVisits(user) {
      return list("visits", { patientId: user.patientId }, { orderBy: { field: "visitDate", direction: "desc" }, limit: 50 });
    }
    async function listSettlements(user) {
      await ensureCollections(["settlements"]);
      return list("settlements", { patientId: user.patientId }, { orderBy: { field: "createdAt", direction: "desc" }, limit: 50 });
    }
    async function listRefunds(user) {
      await ensureCollections(["refunds"]);
      return list("refunds", { requestedBy: user._id }, { orderBy: { field: "createdAt", direction: "desc" }, limit: 50 });
    }
    async function listNotifications(user) {
      return list("notifications", { userId: user._id }, { orderBy: { field: "createdAt", direction: "desc" }, limit: 50 });
    }
    async function readNotification(user, id) {
      const item = await getDoc("notifications", id);
      if (!item || item.userId !== user._id)
        throw new Error("\u901A\u77E5\u4E0D\u5B58\u5728");
      await update("notifications", id, { readAt: /* @__PURE__ */ new Date() });
      return { ok: true };
    }
    async function updateProfile(user, data) {
      requirePatient(user);
      const patient2 = await getDoc("patients", user.patientId);
      await update("patients", user.patientId, {
        phone: data.phone === void 0 ? patient2.phone : String(data.phone).slice(0, 32),
        email: data.email === void 0 ? patient2.email : String(data.email).slice(0, 254),
        billingAddress: data.billingAddress === void 0 ? patient2.billingAddress : String(data.billingAddress).slice(0, 255)
      });
      return { ok: true };
    }
    async function getBinding(user) {
      await ensureCollections(["binding_requests"]);
      const latest = await list("binding_requests", { userId: user._id }, { orderBy: { field: "createdAt", direction: "desc" }, limit: 1 });
      return latest[0] || null;
    }
    async function requestBinding({ user, name, phone }) {
      requirePatient(user);
      await ensureCollections(["binding_requests", "patients"]);
      await seedPatientsOnly();
      const cleanName = String(name || "").trim();
      const cleanPhone = String(phone || "").trim();
      if (!cleanName || !cleanPhone)
        throw new Error("\u8BF7\u586B\u5199\u59D3\u540D\u548C\u624B\u673A\u53F7");
      const patient2 = await findOne("patients", { name: cleanName, phone: cleanPhone });
      if (!patient2)
        throw new Error("\u672A\u627E\u5230\u5339\u914D\u7684\u60A3\u8005\u6863\u6848\uFF0C\u8BF7\u6838\u5BF9\u59D3\u540D\u548C\u624B\u673A\u53F7");
      if (patient2._id === user.patientId)
        throw new Error("\u5F53\u524D\u5FAE\u4FE1\u5DF2\u7ED1\u5B9A\u8BE5\u60A3\u8005\u6863\u6848");
      const pending = await findOne("binding_requests", { userId: user._id, status: "PENDING_REVIEW" });
      if (pending)
        throw new Error("\u5DF2\u6709\u5F85\u5BA1\u6838\u7684\u7ED1\u5B9A\u7533\u8BF7");
      await add("binding_requests", {
        userId: user._id,
        patientId: patient2._id,
        patientName: patient2.name,
        phone: patient2.phone,
        status: "PENDING_REVIEW",
        createdAt: /* @__PURE__ */ new Date()
      });
      return { status: "PENDING_REVIEW", patientName: patient2.name };
    }
    module2.exports = {
      getPatientHome,
      listClinics,
      listDepartments,
      listDentists,
      listTreatments,
      getAvailability,
      createAppointment,
      listAppointments,
      getAppointment,
      payOrder,
      cancelAppointment,
      listOrders,
      getOrder,
      listVisits,
      listSettlements,
      listRefunds,
      listNotifications,
      readNotification,
      updateProfile,
      getBinding,
      requestBinding,
      fmtOrder,
      fmtAppointment
    };
  }
});

// wechat-miniprogram/cloudfunctions/api/index.source.js
var cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
var { ok, fail } = require_db();
var { seedDemo } = require_seed();
var {
  bootstrap,
  registerPatient,
  loginPatient,
  logoutStaff,
  requireUser
} = require_auth();
var patient = require_patient();
exports.main = async (event = {}) => {
  const action = String(event.action || "bootstrap");
  const token = event.token || "";
  try {
    if (action === "bootstrap")
      return ok(await bootstrap(token));
    if (action === "registerPatient")
      return ok(await registerPatient(event.data || event));
    if (action === "loginPatient")
      return ok(await loginPatient(event.account, event.password));
    if (action === "logoutStaff") {
      await logoutStaff(token);
      return ok({ ok: true });
    }
    if (action === "initDemo")
      return ok(await seedDemo());
    const user = await requireUser(token);
    if (action === "home")
      return ok(await patient.getPatientHome(user));
    if (action === "listClinics")
      return ok(await patient.listClinics());
    if (action === "listDepartments")
      return ok(await patient.listDepartments());
    if (action === "listDentists")
      return ok(await patient.listDentists(event.clinicId, event.departmentId));
    if (action === "listTreatments")
      return ok(await patient.listTreatments());
    if (action === "availability")
      return ok(await patient.getAvailability(event));
    if (action === "createAppointment")
      return ok(await patient.createAppointment({ user, ...event }));
    if (action === "listAppointments")
      return ok(await patient.listAppointments(user));
    if (action === "getAppointment")
      return ok(await patient.getAppointment(user, event.appointmentId));
    if (action === "cancelAppointment")
      return ok(await patient.cancelAppointment({ user, appointmentId: event.appointmentId, reason: event.reason }));
    if (action === "payOrder")
      return ok(await patient.payOrder({ user, orderId: event.orderId, outcome: event.outcome }));
    if (action === "listOrders")
      return ok(await patient.listOrders(user));
    if (action === "getOrder")
      return ok(await patient.getOrder(user, event.orderId));
    if (action === "listVisits")
      return ok(await patient.listVisits(user));
    if (action === "listSettlements")
      return ok(await patient.listSettlements(user));
    if (action === "listRefunds")
      return ok(await patient.listRefunds(user));
    if (action === "listNotifications")
      return ok(await patient.listNotifications(user));
    if (action === "readNotification")
      return ok(await patient.readNotification(user, event.notificationId));
    if (action === "updateProfile")
      return ok(await patient.updateProfile(user, event.data || {}));
    if (action === "getBinding")
      return ok(await patient.getBinding(user));
    if (action === "requestBinding")
      return ok(await patient.requestBinding({ user, name: event.name, phone: event.phone }));
    return fail("UNKNOWN_ACTION", "\u672A\u77E5\u64CD\u4F5C\uFF1A" + action);
  } catch (error) {
    console.error(action, error);
    return fail(error.code || "ERROR", error.message || "\u670D\u52A1\u5F02\u5E38");
  }
};
