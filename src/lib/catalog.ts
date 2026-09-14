import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Book } from "@/lib/types";

export type CatalogShelfMap=Record<string,Book[]>;

async function runCatalogSearch(db:SupabaseClient, options:{search?:string;category?:string;author?:string;page?:number;size?:number;sort?:"title"|"recent"|"popular"|"views"}={}){
  const {data,error}=await db.rpc("catalog_search",{
    p_search:options.search||"",p_category:options.category||"",p_author:options.author||"",
    p_page:options.page||1,p_size:Math.min(options.size||20,30),p_sort:options.sort||"title"
  });
  if(error){
    console.error("[catalog_search]",{code:error.code,message:error.message});
    throw new Error("Não foi possível carregar o acervo. Tente novamente.");
  }
  return data as {books:Book[];total:number;page:number};
}

export async function searchCatalog(db:SupabaseClient, options:{search?:string;category?:string;author?:string;page?:number;size?:number;sort?:"title"|"recent"|"popular"|"views"}={}){
  const isPublicRequest=!options.search&&!options.category&&!options.author;
  if(!isPublicRequest) return runCatalogSearch(db,options);

  return unstable_cache(
    ()=>runCatalogSearch(db,options),
    ["catalog-search",JSON.stringify(options)],
    {revalidate:120}
  )();
}

export async function catalogAuthors(db:SupabaseClient){
  return unstable_cache(async()=>{
    const {data,error}=await db.rpc("catalog_authors");
    if(error){console.error("[catalog_authors]",{code:error.code,message:error.message});return [] as string[];}
    return data as string[];
  },["catalog-authors"],{revalidate:600})();
}

export async function catalogShelves(db:SupabaseClient,parentSlug="",size=12){
  return unstable_cache(async()=>{
    const {data,error}=await db.rpc("catalog_shelves",{p_parent_slug:parentSlug,p_size:Math.min(size,20)});
    if(error){
      console.error("[catalog_shelves]",{code:error.code,message:error.message,parentSlug});
      return {} as CatalogShelfMap;
    }
    return (data||{}) as CatalogShelfMap;
  },["catalog-shelves",parentSlug,String(size)],{revalidate:120})();
}
