// Passwords that are guessed first (gap list G45): a small list kept here, with
// no outside service. A password is "common" when, ignoring capitals, numbers
// and signs at its start or end, and look-alike letters (p@ssw0rd), it is one of
// these words; or when it is mostly numbers with one or two letters (a1234567).
// Lists of leaked passwords show these on top, in India too (school, cricket,
// city and god names, keyboard rows).

const WORDS = [
  // The world's most guessed.
  "password", "passwd", "pass", "qwerty", "qwertyuiop", "qwertyui", "asdf", "asdfgh", "asdfghjkl", "zxcvbn", "zxcvbnm", "qazwsx",
  "abc", "abcd", "abcde", "abcdef", "abcdefg", "abcdefgh", "iloveyou", "loveyou", "love", "welcome", "hello", "admin", "administrator",
  "letmein", "monkey", "dragon", "sunshine", "princess", "football", "baseball", "master", "shadow", "superman", "batman",
  "trustno", "secret", "login", "user", "guest", "test", "testing", "demo", "changeme", "default", "temp", "temporary", "newpassword",
  "mypassword", "freedom", "whatever", "starwars", "pokemon", "computer", "internet", "google", "facebook", "whatsapp", "instagram",
  "samsung", "apple", "iphone", "india", "bharat", "hindustan", "jaihind", "cricket", "sachin", "dhoni", "virat", "kohli",
  // School words.
  "school", "schoolos", "student", "students", "teacher", "teachers", "principal", "accountant", "office", "library", "college",
  "class", "exam", "fees", "staff",
  // Cities.
  "mumbai", "delhi", "chennai", "kolkata", "hyderabad", "bangalore", "bengaluru", "pune", "ahmedabad", "jaipur", "lucknow",
  "vijayawada", "visakhapatnam", "vizag", "guntur", "warangal", "secunderabad", "mysore", "coimbatore", "madurai",
  // Names of god and greetings often used as passwords.
  "krishna", "ganesh", "ganesha", "sairam", "omsairam", "jaishriram", "shriram", "srirama", "rama", "hanuman", "balaji",
  "venkateswara", "shiva", "omnamahshivaya", "allah", "jesus", "waheguru", "namaste",
  // Family words.
  "mother", "father", "family", "baby", "darling", "sweety", "sweetheart", "angel", "friend", "friends",
];

const COMMON = new Set(WORDS);

/** Look-alike signs and digits inside a word, read as the letters they stand for. */
const LOOK_ALIKE: Record<string, string> = { "@": "a", "4": "a", "0": "o", "1": "i", "!": "i", "3": "e", "5": "s", "$": "s", "7": "t", "8": "b" };

export function isCommonPassword(password: string): boolean {
  const lower = password.toLowerCase();
  // The letters with the numbers and signs at the start and end taken off: "Password@123" is "password".
  const core = lower.replace(/^[^a-z]+|[^a-z]+$/g, "");
  if (!core) return true;
  if (/^[a-z]{1,2}$/.test(core)) return true;
  const plain = core.replace(/[@4013578!$]/g, (c) => LOOK_ALIKE[c] ?? c).replace(/[^a-z]/g, "");
  if (COMMON.has(core) || COMMON.has(plain)) return true;
  // One letter or two letters over and over, or a run of the alphabet: "aaaa1111", "abab1234", "abcd".
  if (/^(.)\1+$/.test(plain) || /^(..)\1+$/.test(plain)) return true;
  return false;
}
