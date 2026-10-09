// Realistic Indian names for the demo school, picked deterministically so
// every run of the seed makes the same school.

export const BOY_NAMES = ["Aarav", "Vihaan", "Arjun", "Sai", "Reyansh", "Krishna", "Ishaan", "Rohan", "Aditya", "Karthik", "Pranav", "Rahul", "Harsha", "Nikhil", "Varun", "Siddharth", "Teja", "Manish", "Abhinav", "Charan", "Dhruv", "Yash", "Kabir", "Ayaan", "Vivek", "Akhil", "Rithvik", "Shreyas", "Tarun", "Naveen"];
export const GIRL_NAMES = ["Aanya", "Diya", "Saanvi", "Ananya", "Aadhya", "Pari", "Ira", "Myra", "Sneha", "Kavya", "Meghana", "Harini", "Lasya", "Nandini", "Pooja", "Riya", "Sahithi", "Tanvi", "Vaishnavi", "Akshara", "Bhavya", "Deepika", "Keerthi", "Navya", "Sravya", "Hasini", "Varsha", "Ishita", "Gayatri", "Shreya"];
export const SURNAMES = ["Reddy", "Rao", "Sharma", "Kumar", "Naidu", "Varma", "Gupta", "Iyer", "Patel", "Chowdary", "Goud", "Yadav", "Singh", "Nair", "Menon", "Mehta", "Agarwal", "Joshi", "Kulkarni", "Pillai", "Shetty", "Bhat", "Das", "Mishra", "Verma"];
export const FATHER_NAMES = ["Srinivas", "Ramesh", "Venkatesh", "Prakash", "Rajesh", "Suresh", "Mahesh", "Anil", "Sunil", "Vijay", "Ravi", "Kiran", "Mohan", "Satish", "Naresh", "Ganesh", "Dinesh", "Rakesh", "Harish", "Sanjay"];
export const MOTHER_NAMES = ["Lakshmi", "Padma", "Sujatha", "Radha", "Kavitha", "Swathi", "Anitha", "Sunitha", "Rekha", "Madhavi", "Jyothi", "Shobha", "Vani", "Latha", "Divya", "Sarita", "Usha", "Geetha", "Priya", "Aruna"];
export const OCCUPATIONS = ["Software Engineer", "Business", "Teacher", "Doctor", "Farmer", "Government Employee", "Bank Employee", "Homemaker", "Shop Owner", "Accountant", "Driver", "Contractor"];
export const LOCALITIES = ["Madhapur", "Kukatpally", "Gachibowli", "Miyapur", "Kondapur", "Ameerpet", "Begumpet", "Uppal", "LB Nagar", "Dilsukhnagar", "Secunderabad", "Banjara Hills"];

/** A small, repeatable random number generator (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(r: () => number, list: readonly T[]): T {
  return list[Math.floor(r() * list.length)];
}

export function phoneFrom(r: () => number) {
  const first = pick(r, ["9", "8", "7", "6"]);
  let rest = "";
  for (let i = 0; i < 9; i++) rest += Math.floor(r() * 10);
  return first + rest;
}

export function day(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}
