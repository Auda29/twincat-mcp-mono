using System;
using System.Collections.Generic;
using System.Web.Script.Serialization;

namespace TwinCatMcp.Engineering.Host
{
    // JavaScriptSerializer accepts duplicate keys. Reject them before using its
    // parsed representation for identity, approval or dispatch decisions.
    internal sealed class UniqueJsonKeys
    {
        private readonly string text;
        private int position;
        private readonly JavaScriptSerializer serializer = new JavaScriptSerializer();
        private UniqueJsonKeys(string text) { this.text = text; }
        internal static void Validate(string text)
        {
            var scanner = new UniqueJsonKeys(text);
            scanner.Value(0); scanner.White();
            if (scanner.position != text.Length) throw new ArgumentException("Invalid JSON");
        }
        private void White() { while (position < text.Length && (text[position] == ' ' || text[position] == '\t' || text[position] == '\r' || text[position] == '\n')) position++; }
        private void Value(int depth)
        {
            if (depth > 32) throw new ArgumentException("JSON depth");
            White(); if (position >= text.Length) throw new ArgumentException("Invalid JSON");
            if (text[position] == '{')
            {
                position++; White(); var keys = new HashSet<string>(StringComparer.Ordinal);
                if (Take('}')) return;
                do { White(); var key = String(); if (!keys.Add(key)) throw new ArgumentException("Duplicate JSON key"); White(); Require(':'); Value(depth + 1); White(); if (Take('}')) return; Require(','); } while (true);
            }
            if (text[position] == '[')
            {
                position++; White(); if (Take(']')) return;
                do { Value(depth + 1); White(); if (Take(']')) return; Require(','); } while (true);
            }
            if (text[position] == '"') { String(); return; }
            int start = position;
            while (position < text.Length && ",]} \t\r\n".IndexOf(text[position]) < 0) position++;
            if (position == start) throw new ArgumentException("Invalid JSON");
            // The actual JSON parser validates primitive syntax afterward.
        }
        private string String()
        {
            int start = position; Require('"');
            while (position < text.Length)
            {
                char c = text[position++];
                if (c == '\\') { if (position >= text.Length) break; position++; continue; }
                if (c == '"') return serializer.Deserialize<string>(text.Substring(start, position - start));
            }
            throw new ArgumentException("Invalid JSON string");
        }
        private bool Take(char c) { if (position < text.Length && text[position] == c) { position++; return true; } return false; }
        private void Require(char c) { if (!Take(c)) throw new ArgumentException("Invalid JSON"); }
    }
}
