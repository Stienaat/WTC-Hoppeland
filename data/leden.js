import { supabase } from './supabase.js';

export async function getLeden() {
  const { data, error } = await supabase
    .from('leden')
    .select('*')
    .order('naam');

  if (error) throw error;
  return data;
}

export async function addLid(lid) {
  const { data, error } = await supabase
    .from('leden')
    .insert([lid]);

  if (error) throw error;
  return data;
}

