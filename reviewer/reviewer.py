import os,time,re,requests
from supabase import create_client
BATCH=int(os.getenv("BATCH_SIZE","100")); SLEEP=int(os.getenv("SLEEP_SECONDS","60"))
db=create_client(os.environ["SUPABASE_URL"],os.environ["SUPABASE_SERVICE_ROLE_KEY"])
def norm(s): return re.sub(r"[^a-z0-9 ]"," ",(s or "").lower()).strip()
def valid_cover(u): return isinstance(u,str) and u.startswith("https://") and "/api/covers/" not in u
def google(q):
 try:return requests.get("https://www.googleapis.com/books/v1/volumes",params={"q":q,"maxResults":10},timeout=20).json().get("items",[])
 except:return []
def score(b,x):
 i=x.get("volumeInfo",{});t=norm(b.get("title"));ct=norm(i.get("title"));a=norm(b.get("author"));ca=norm(" ".join(i.get("authors",[])))
 return (68 if t==ct else 55 if t and ct and (t in ct or ct in t) else 0)+(20 if a==ca else 14 if a and ca and (a in ca or ca in a) else 0)
def work(b):
 qs=[f'intitle:"{b.get("title","")}" inauthor:"{b.get("author","")}"',b.get("title","")]; best=None;bs=-1
 for q in qs:
  for x in google(q):
   s=score(b,x)
   if s>bs:best,bs=x,s
 if not best or bs<92:return False
 i=best["volumeInfo"]; upd={};cover=(i.get("imageLinks") or {}).get("thumbnail")
 if cover:cover=cover.replace("http://","https://")
 if valid_cover(cover):upd["cover_url"]=cover
 if len(i.get("description") or "")>=80:upd["description"]=i["description"]
 if i.get("pageCount"):upd["pages"]=i["pageCount"]
 if i.get("language"):upd["language"]=i["language"]
 if re.match(r"^\d{4}",i.get("publishedDate") or ""):upd["year"]=int(i["publishedDate"][:4])
 f={**b,**upd}; complete=bool(f.get("title") and f.get("author") and f.get("description") and f.get("pages") and f.get("year") and f.get("language") and valid_cover(f.get("cover_url")) and f.get("category_id"))
 upd.update(metadata_reviewed=complete,knowledge_confidence=bs,knowledge_status="complete" if complete else "batch_locked")
 db.table("books").update(upd).eq("id",b["id"]).execute();return complete
def cycle():
 cols="id,title,author,description,cover_url,language,year,pages,file_name,category_id"; q=db.table("books").select(cols).eq("published",True).eq("knowledge_status","batch_locked").eq("metadata_reviewed",False).limit(BATCH).execute().data
 if not q:
  q=db.table("books").select(cols).eq("published",True).eq("metadata_reviewed",False).limit(BATCH).execute().data
  if q:db.table("books").update({"knowledge_status":"batch_locked"}).in_("id",[x["id"] for x in q]).execute()
 done=sum(work(x) for x in q);print(f"Lote {len(q)} | concluídos {done} | restantes {len(q)-done}",flush=True)
while True:
 try:cycle()
 except Exception as e:print("ERRO",repr(e),flush=True)
 time.sleep(SLEEP)
