export interface CuriosityItem {
  id: string;
  title: string;
  sequence: string;
  digitIndex: number;
  description: string;
  probability: string;
}

export const CURIOSITIES: CuriosityItem[] = [
  {
    id: 'feynman',
    title: 'The Feynman Point (999999)',
    sequence: '999999',
    digitIndex: 761,
    description: 'Six consecutive nines. Physicist Richard Feynman famously noted he wanted to memorize π up to this point so he could recite it and end with "nine, nine, nine..."',
    probability: '1 in 1,000,000'
  },
  {
    id: 'zeros',
    title: 'First Six Zeros (000000)',
    sequence: '000000',
    digitIndex: 1699926,
    description: 'The very first occurrence of six consecutive zeros in the first 10M digits of π.',
    probability: '1 in 1,000,000'
  },
  {
    id: 'euler',
    title: "Euler's Number e in π (271828)",
    sequence: '271828',
    digitIndex: 33788,
    description: 'The first six digits of Euler’s mathematical constant e (2.71828) appear hidden inside π at position 33,789.',
    probability: '1 in 1,000,000'
  },
  {
    id: 'ascending',
    title: 'Ascending Run (123456)',
    sequence: '123456',
    digitIndex: 2458884,
    description: 'A run of six decimal digits counting up in strict natural ascending order.',
    probability: '1 in 1,000,000'
  },
  {
    id: 'pi-in-pi',
    title: 'Self-Reference: π in π (314159)',
    sequence: '314159',
    digitIndex: 176450,
    description: 'The opening six digits of π (3.14159) repeat themselves inside π at position 176,451.',
    probability: '1 in 1,000,000'
  },
  {
    id: 'countdown',
    title: 'The Countdown (654321)',
    sequence: '654321',
    digitIndex: 721090,
    description: 'Six consecutive digits counting down in strict reverse order.',
    probability: '1 in 1,000,000'
  },
  {
    id: 'fibonacci',
    title: 'Fibonacci Run (112358)',
    sequence: '112358',
    digitIndex: 820388,
    description: 'The opening sequence of the Fibonacci numbers (1, 1, 2, 3, 5, 8) embedded in π.',
    probability: '1 in 1,000,000'
  },
  {
    id: 'seven-sevens',
    title: 'Seven Consecutive Sevens (7777777)',
    sequence: '7777777',
    digitIndex: 3346227,
    description: 'An astonishing unbroken run of seven consecutive sevens.',
    probability: '1 in 10,000,000'
  }
];
