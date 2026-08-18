/* ตรวจข้ออ้างเชิงตัวเลขทุกข้อที่ปรากฏในคอร์ส C ด้วยการรันจริง */
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <stdint.h>
#include <limits.h>
#include <stddef.h>
#include <math.h>

static int fails = 0;
#define CHECK(desc, cond) do { \
    if (cond) printf("ok    %s\n", desc); \
    else { printf("FAIL  %s\n", desc); fails++; } \
} while (0)

struct wasteful { char a; int b; char c; };
struct tidy     { int b; char a; char c; };

int main(void) {
    /* --- types-and-operators --- */
    CHECK("7 / 2 == 3", (7 / 2) == 3);
    CHECK("(double)7 / 2 == 3.5", ((double)7 / 2) == 3.5);
    { int i = -1; unsigned u = 1; CHECK("(-1 < 1u) is FALSE", !(i < u)); }
    { int big = 300; char small = (char)big; CHECK("(char)300 == 44", small == 44); }
    { unsigned char c = 255; c = (unsigned char)(c + 1); CHECK("(unsigned char)255+1 == 0", c == 0); }
    CHECK("7 % 2 == 1", (7 % 2) == 1);

    /* --- bitwise-ops --- */
    CHECK("12 & 10 == 8",  (12 & 10) == 8);
    CHECK("12 | 10 == 14", (12 | 10) == 14);
    CHECK("12 ^ 10 == 6",  (12 ^ 10) == 6);
    CHECK("3 << 2 == 12",  (3u << 2) == 12);
    CHECK("12 >> 2 == 3",  (12u >> 2) == 3);
    { unsigned x = 8; CHECK("x&(x-1)==0 for power of two", (x & (x - 1)) == 0); }
    { unsigned x = 12; CHECK("x&(x-1)!=0 for non power of two", (x & (x - 1)) != 0); }
    { unsigned h = 0x12345678u;
      CHECK("(h>>28)&0xF == 1", ((h >> 28) & 0xFu) == 1);
      CHECK("h & 0xFFFF == 0x5678", (h & 0xFFFFu) == 0x5678u); }

    /* --- integer-representation --- */
    CHECK("INT_MAX == 2147483647", INT_MAX == 2147483647);
    CHECK("INT_MIN == -2147483648", INT_MIN == (-2147483647 - 1));
    CHECK("UINT_MAX == 4294967295u", UINT_MAX == 4294967295u);
    { unsigned char all_ones = 0xFF; signed char as_signed; memcpy(&as_signed, &all_ones, 1);
      CHECK("all-ones byte read as signed == -1", as_signed == -1); }
    { unsigned u = (unsigned)(-1); CHECK("(unsigned)(-1) == UINT_MAX", u == UINT_MAX); }
    { unsigned u = UINT_MAX; u = u + 1; CHECK("unsigned wrap UINT_MAX+1 == 0", u == 0); }
    /* two's complement 4-bit table from the lesson */
    { signed char t = (signed char)0xF8; /* 1000 in 4-bit == -8 */
      CHECK("4-bit 1111 == -1 (as pattern)", ((signed char)0xFF) == -1);
      (void)t; }

    /* --- endianness --- */
    { uint32_t v = 0x12345678u; unsigned char *b = (unsigned char *)&v;
      int little = (b[0] == 0x78 && b[1] == 0x56 && b[2] == 0x34 && b[3] == 0x12);
      int big    = (b[0] == 0x12 && b[1] == 0x34 && b[2] == 0x56 && b[3] == 0x78);
      CHECK("0x12345678 bytes match one documented order", little || big);
      printf("      (this machine: %s)\n", little ? "little-endian" : "big-endian"); }

    /* --- floating-point --- */
    { double a = 0.1 + 0.2; CHECK("0.1 + 0.2 != 0.3", a != 0.3);
      char buf[64]; snprintf(buf, sizeof buf, "%.20f", a);
      CHECK("0.1+0.2 prints 0.30000000000000004441", strcmp(buf, "0.30000000000000004441") == 0);
      if (strcmp(buf, "0.30000000000000004441") != 0) printf("      actual: %s\n", buf); }
    { double nan_v = 0.0 / 0.0; CHECK("NaN != NaN", !(nan_v == nan_v)); CHECK("isnan detects NaN", isnan(nan_v)); }
    { double inf_v = 1.0 / 0.0; CHECK("1.0/0.0 is infinite", isinf(inf_v)); }
    { double total = 0.0; for (int i = 0; i < 1000; i++) total += 0.01;
      CHECK("1000 x 0.01 != 10.0", total != 10.0);
      char b10[64], b15[64];
      snprintf(b10, sizeof b10, "%.10f", total);
      snprintf(b15, sizeof b15, "%.15f", total);
      CHECK("money loop at %.10f prints 10.0000000000 (printf rounds it)",
            strcmp(b10, "10.0000000000") == 0);
      CHECK("money loop at %.15f prints 9.999999999999831 (the real value)",
            strcmp(b15, "9.999999999999831") == 0);
      if (strcmp(b15, "9.999999999999831") != 0) printf("      actual: %s\n", b15); }
    { double x = 0.5, y = 0.25; CHECK("0.5 is exact", x * 2 == 1.0); CHECK("0.25 is exact", y * 4 == 1.0); }

    /* --- arrays-and-strings --- */
    { char greeting[] = "hi";
      CHECK("sizeof \"hi\" array == 3", sizeof greeting == 3);
      CHECK("strlen(\"hi\") == 2", strlen(greeting) == 2); }
    { int ready[5] = {1,2,3,4,5};
      CHECK("sizeof arr / sizeof arr[0] == 5", (sizeof ready / sizeof ready[0]) == 5); }

    /* --- structs: padding --- */
    CHECK("sizeof(struct wasteful) == 12", sizeof(struct wasteful) == 12);
    CHECK("sizeof(struct tidy) == 8", sizeof(struct tidy) == 8);
    CHECK("offsetof(wasteful, b) == 4", offsetof(struct wasteful, b) == 4);
    { union { int as_int; float as_float; } u;
      CHECK("union size == largest member", sizeof u == 4); (void)u; }

    /* --- pointers and arithmetic --- */
    { int v[4] = {10,20,30,40}; int *p = v;
      CHECK("v[2] == *(p+2)", v[2] == *(p + 2));
      CHECK("v[2] == 2[v]", v[2] == 2[v]);
      CHECK("(p+1) - p == 1 element", (p + 1) - p == 1);
      CHECK("(char*)(p+1) - (char*)p == sizeof(int)",
            (size_t)((char *)(p + 1) - (char *)p) == sizeof(int));
      CHECK("(v+3) - v == 3", (v + 3) - v == 3); }

    /* --- comparator idiom from function-pointers --- */
    { int x = 2000000000, y = -2000000000;
      int three_way = (x > y) - (x < y);
      CHECK("(x>y)-(x<y) == 1 for x>y at extremes", three_way == 1); }

    /* --- calloc overflow detection claim --- */
    { size_t huge = SIZE_MAX / 2 + 1;
      void *p = calloc(huge, 4);
      CHECK("calloc detects multiplication overflow (returns NULL)", p == NULL);
      free(p); }

    /* --- sizes actually used in prose --- */
    printf("      sizeof int=%zu long=%zu size_t=%zu char=%zu double=%zu float=%zu\n",
           sizeof(int), sizeof(long), sizeof(size_t), sizeof(char), sizeof(double), sizeof(float));
    CHECK("int is 4 bytes on this machine (as lesson table says 'typically')", sizeof(int) == 4);
    CHECK("size_t is 8 bytes on this 64-bit machine", sizeof(size_t) == 8);
    CHECK("double is 8 bytes", sizeof(double) == 8);
    CHECK("float is 4 bytes", sizeof(float) == 4);

    printf("\n%s: %d failing claim(s)\n", fails ? "RESULT" : "RESULT", fails);
    return fails != 0;
}
