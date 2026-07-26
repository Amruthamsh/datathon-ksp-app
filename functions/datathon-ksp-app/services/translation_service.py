"""Translation service using the LLM for Kannada <-> English translation.

Provides two key functions:
1. translate_query: Converts a Kannada user query to canonical English
2. translate_response: Converts English analysis output to natural Kannada
"""

from llm.llm_service import LLMService
from config.domain_dictionary import (
    get_all_domainictionaries,
    DISTRICT_KN_EN,
    CRIME_HEAD_KN_EN,
    CRIME_SUBHEAD_KN_EN,
)


def build_translation_prompt(text: str, direction: str, language: str) -> tuple[str, str]:
    """Build system and user prompts for translation.

    direction: "kn_to_en" for input translation, "en_to_kn" for output
    """
    dictionaries = get_all_domainictionaries()

    dict_text = ""
    for category, mapping in dictionaries.items():
        dict_text += f"\n{category}:\n"
        for kn, en in mapping.items():
            dict_text += f"  {kn} -> {en}\n"

    if direction == "kn_to_en":
        system = """You are a Kannada-to-English translator for the Karnataka State Police crime database system.

Your task: Translate the user's Kannada query into a canonical English query that can be used to generate SQL.

Rules:
1. Translate the MEANING naturally, not word-for-word.
2. Use the EXACT English terms from the domain dictionary below for:
   - Crime types (e.g., "ಕಳ್ಳತನ" -> "Theft", not "stealing")
   - District names (e.g., "ಬೆಂಗಳೂರು" -> "Bengaluru Urban")
   - Police terms (e.g., "ಎಫ್‌ಐಆರ್" -> "FIR")
3. Keep dates, numbers, and IDs in their original form.
4. Preserve the logical intent (e.g., "ಹೆಚ್ಚು" -> "most/top", "ಕಡಿಮೆ" -> "least").
5. Output ONLY the translated English query, nothing else.

Domain Dictionary:"""

        user = f"Translate this Kannada query to English:\n\n{text}\n\nTranslated English query:"

    else:  # en_to_kn
        system = """You are an English-to-Kannada translator for the Karnataka State Police crime intelligence system.

Your task: Translate the English analysis response into fluent, natural Kannada.

Rules:
1. Translate into formal but accessible Kannada suitable for police officers.
2. Use the Kannada equivalents from the domain dictionary for crime types, districts, and police terms.
3. Keep these in English/original form:
   - Crime numbers (e.g., "CR-2024-001234")
   - IDs, codes, reference numbers
   - Proper nouns (names of people)
   - SQL keywords or technical terms
4. Numbers should use Kannada numerals when practical (೧೨೩೪೫೬೭೮೯೦), but Arabic numerals are also acceptable.
5. Produce natural Kannada prose, not word-for-word translation.
6. Keep markdown formatting (headers, bullets, bold).

Domain Dictionary:"""

        user = f"Translate this English response to Kannada:\n\n{text}\n\nKannada translation:"

    return system + "\n" + dict_text, user


def translate_query_kn_to_en(query: str, llm: LLMService) -> str:
    """Translate a Kannada user query to canonical English."""
    system_prompt, user_prompt = build_translation_prompt(query, "kn_to_en", "kn")
    result = llm.generate(user_prompt=user_prompt, system_prompt=system_prompt)
    return result.strip()


def translate_response_en_to_kn(response: str, llm: LLMService) -> str:
    """Translate an English analysis response to natural Kannada."""
    system_prompt, user_prompt = build_translation_prompt(response, "en_to_kn", "kn")
    result = llm.generate(user_prompt=user_prompt, system_prompt=system_prompt)
    return result.strip()


def translate_chart_terms_en_to_kn(charts: list[dict]) -> list[dict]:
    """Translate chart titles and labels from English to Kannada.

    This is a lightweight dictionary-based translation for structured
    chart metadata (titles, column names) that doesn't need LLM.
    """
    term_map = {
        "Crime Type": "ಅಪರಾಧ ವಿಧ",
        "District": "ಜಿಲ್ಲೆ",
        "Cases": "ಪ್ರಕರಣಗಳು",
        "Count": "ಎಣಿಕೆ",
        "Station": "ಠಾಣೆ",
        "Month": "ತಿಂಗಳು",
        "Year": "ವರ್ಷ",
        "Crime Head": "ಅಪರಾಧ ವಿಭಾಗ",
        "Gravity": "ತೀವ್ರತೆ",
        "Status": "ಸ್ಥಿತಿ",
        "Age": "ವಯಸ್ಸು",
        "Gender": "ಲಿಂಗ",
        "Top Crime Types": "ಅತ್ಯಧಿಕ ಅಪರಾಧಗಳ ವಿಧಗಳು",
        "Cases by District": "ಜಿಲ್ಲಾವಾರು ಪ್ರಕರಣಗಳು",
        "Monthly Trend": "ಮಾಸಿಕ ಪ್ರವೃತ್ತಿ",
        "Crime Distribution": "ಅಪರಾಧ ವಿತರಣೆ",
        "Repeat Offenders": "ಪುನರಾವರ್ತಿತ ಅಪರಾಧಿಗಳು",
        "Heinous": "ಗಂಭೀರ",
        "Non-Heinous": "ಗಂಭೀರವಲ್ಲದ",
        "Petty": "ಸಣ್ಣ",
        "Under Investigation": "ತನಿಖೆ ನಡೆಯುತ್ತಿದೆ",
        "Charge Sheeted": "ಚಾರ್ಜ್‌ಶೀಟ್ ಸಲ್ಲಿಸಲಾಗಿದೆ",
        "Closed": "ಮುಚ್ಚಲಾಗಿದೆ",
    }

    translated = []
    for chart in charts:
        new_chart = dict(chart)
        if "title" in new_chart:
            for en, kn in term_map.items():
                new_chart["title"] = new_chart["title"].replace(en, kn)
        translated.append(new_chart)
    return translated


def translate_follow_ups_en_to_kn(questions: list[str]) -> list[str]:
    """Translate follow-up question hints from English to Kannada.

    Lightweight dictionary-based translation for common question patterns.
    """
    pattern_map = {
        "What are the": "ಯಾವುದು",
        "How many": "ಎಷ್ಟು",
        "Which district": "ಯಾವ ಜಿಲ್ಲೆ",
        "Show me": "ತೋರಿಸಿ",
        "Compare": "ಹೋಲಿಸಿ",
        "trend": "ಪ್ರವೃತ್ತಿ",
        "district": "ಜಿಲ್ಲೆ",
        "crime": "ಅಪರಾಧ",
    }
    # For follow-ups, it's better to keep them in English and let the
    # response_node generate them in Kannada directly when language is kn.
    return questions
