"use client";
import React,{useState} from "react";
export function EvidenceCapture({onSelected}:{onSelected:(f:File|null)=>void}){
 const [file,setFile]=useState<File|null>(null);const [error,setError]=useState("");
 const choose=(f:File|null)=>{setError("");if(f&&(f.size>15*1024*1024||!/^image\/(jpeg|png|webp)$/i.test(f.type))){setError("Gunakan JPG/PNG/WebP maksimal 15 MB.");setFile(null);onSelected(null);return;}setFile(f);onSelected(f)};
 return <div className="space-y-2"><label className="block text-sm font-medium">Foto bukti (opsional, max 15 MB)<input className="block w-full mt-1" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e=>choose(e.target.files?.[0]??null)}/></label>{file&&<p className="text-xs text-gray-600">Dipilih: {file.name} · {(file.size/1024/1024).toFixed(2)} MB. File hanya terpilih; upload server belum dilakukan.</p>}{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}</div>
}
export default EvidenceCapture;
