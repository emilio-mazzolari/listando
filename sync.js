const SUPABASE_URL = "https://eejdpophfxsrqdvsucye.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlamRwb3BoZnhzcnFkdnN1Y3llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NTMzMDQsImV4cCI6MjA5MzIyOTMwNH0.mpxbwlJyIdZgqKIdutHbLd85JR1P11yiglbYeApi17k";

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