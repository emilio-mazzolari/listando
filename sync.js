const SUPABASE_URL = "https://eejdpophfxsrqdvsucye.supabase.co";
const SUPABASE_KEY = "sb_publishable_A7ZE5MzG6TtUrTKNo3SebA_qOk3_n4v";

/* ===== SYNC LOCAL → SUPABASE ===== */
async function syncToCloud() {
  const items = await getItems();

  for (const item of items) {
    if (!item.synced) {
      await fetch(SUPABASE_URL + "/rest/v1/lista_spesa", {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          nome: item.nome,
          completato: item.completato
        })
      });

      item.synced = true;
      await updateItem(item);
    }
  }
}

/* AUTO SYNC QUANDO TORNA INTERNET */
window.addEventListener("online", syncToCloud);