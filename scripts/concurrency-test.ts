/**
 * Teste de carga da camada 3 (docs/ARQUITETURA.md, seção 03/04): dispara N
 * requisições simultâneas de criação de agendamento para o MESMO horário e
 * barbeiro, e afirma que exatamente uma passa (201) e todas as outras são
 * rejeitadas como conflito (409 SLOT_TAKEN). É o critério de saída da fase
 * "motor de agenda" — sem isso passando, não há garantia real contra
 * double booking sob concorrência.
 */
import { PrismaClient } from "@prisma/client";
import { DateTime } from "luxon";

const BASE_URL = process.env.API_URL ?? "http://localhost:3000";
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 50);
const BARBER_ID = "brb_joao";
const CLIENT_ID = "cli_maria";
const SERVICE_IDS = ["svc_corte"];

const prisma = new PrismaClient();

function nextWeekdayAt(hour: number): DateTime {
  let dt = DateTime.now().setZone("America/Sao_Paulo").plus({ days: 3 }).set({
    hour,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  while (dt.weekday > 5) dt = dt.plus({ days: 1 }); // pula fim de semana
  return dt;
}

async function main() {
  const target = nextWeekdayAt(10);
  const startsAt = target.toISO()!;
  console.log(`Alvo: ${BARBER_ID} em ${startsAt} (${CONCURRENCY} requisições simultâneas)\n`);

  // limpa uma eventual sobra de execução anterior, para o teste ser repetível
  await prisma.appointment.deleteMany({ where: { barberId: BARBER_ID, startsAt: target.toJSDate() } });

  const requests = Array.from({ length: CONCURRENCY }, (_, i) =>
    fetch(`${BASE_URL}/appointments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        barberId: BARBER_ID,
        clientId: CLIENT_ID,
        serviceIds: SERVICE_IDS,
        startsAt,
        clientNotes: `requisição concorrente #${i}`,
      }),
    }).then(async (res) => ({ status: res.status, body: await res.json() })),
  );

  const results = await Promise.all(requests);

  const created = results.filter((r) => r.status === 201);
  const conflicted = results.filter((r) => r.status === 409);
  const unexpected = results.filter((r) => r.status !== 201 && r.status !== 409);

  console.log(`201 Created:     ${created.length}`);
  console.log(`409 SLOT_TAKEN:  ${conflicted.length}`);
  console.log(`Inesperado:      ${unexpected.length}`);

  if (unexpected.length > 0) {
    console.log("\nRespostas inesperadas:");
    for (const r of unexpected) console.log(JSON.stringify(r, null, 2));
  }

  const dbCount = await prisma.appointment.count({
    where: { barberId: BARBER_ID, startsAt: target.toJSDate(), status: { not: "CANCELADO" } },
  });
  console.log(`\nLinhas no banco para esse slot: ${dbCount}`);

  const pass = created.length === 1 && conflicted.length === CONCURRENCY - 1 && dbCount === 1;
  console.log(pass ? "\n✔ PASSOU — nenhum double booking sob concorrência." : "\n✘ FALHOU");

  await prisma.$disconnect();
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
